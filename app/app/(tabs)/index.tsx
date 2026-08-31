import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { StaffPickerSheet } from "../../components/StaffPickerSheet";
import { UploadButton } from "../../components/UploadButton";
import { analyzeShiftFile, type PickedFile } from "../../lib/api";
import { withAlpha } from "../../lib/color";
import { setDebugImages } from "../../lib/debugImageStore";
import { storage } from "../../lib/storage";
import { theme } from "../../lib/theme";
import { TutorialDim, TutorialTarget } from "../../lib/tutorial";
import { isDayOff, type AnalyzeResponse, type CalendarEntries, type CalendarOverrides, type ShiftType } from "../../lib/types";

/** Caricamenti (foto/PDF/Word) concessi per giorno a un dispositivo: protezione contro l'uso eccessivo dell'analisi, non contro l'abuso deliberato (vedi storage.consumeDailyUpload). */
const DAILY_UPLOAD_LIMIT = 4;
/** Quanti turni futuri mostrare al massimo in "Prossimi turni": una rapida occhiata, non un secondo calendario. */
const MAX_UPCOMING = 3;

const MONTH_NAMES = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

function toIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatUpcomingDate(dateIso: string): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
}

export default function HomeScreen() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [loading, setLoading] = useState(false);
  const [userName, setUserName] = useState("");
  const [debugMode, setDebugMode] = useState(false);
  const [shiftTypes, setShiftTypes] = useState<ShiftType[]>([]);
  const [entries, setEntries] = useState<CalendarEntries>({});
  const [overrides, setOverrides] = useState<CalendarOverrides>({});
  const [pendingFile, setPendingFile] = useState<PickedFile | null>(null);
  const [candidateNames, setCandidateNames] = useState<string[]>([]);

  useFocusEffect(
    useCallback(() => {
      Promise.all([
        storage.getSettings(),
        storage.getShiftTypes(),
        storage.getCalendarEntries(),
        storage.getCalendarOverrides(),
      ]).then(([s, types, e, o]) => {
        setUserName(s.userName);
        setDebugMode(s.debugMode);
        setShiftTypes(types);
        setEntries(e);
        setOverrides(o);
      });
    }, []),
  );

  const shiftTypeById = useMemo(() => new Map(shiftTypes.map((s) => [s.id, s])), [shiftTypes]);

  const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;
  const monthStats = useMemo(() => {
    let workDays = 0;
    let restDays = 0;
    for (const [date, shiftTypeId] of Object.entries(entries)) {
      if (!date.startsWith(monthPrefix)) continue;
      const shiftType = shiftTypeById.get(shiftTypeId);
      if (!shiftType) continue;
      if (isDayOff(shiftType)) {
        if (shiftType.isRestDay) restDays += 1;
      } else {
        workDays += 1;
      }
    }
    return { workDays, restDays };
  }, [entries, shiftTypeById, monthPrefix]);

  const upcomingShifts = useMemo(() => {
    const todayIso = toIso(new Date());
    return Object.entries(entries)
      .filter(([date, shiftTypeId]) => {
        if (date < todayIso) return false;
        const shiftType = shiftTypeById.get(shiftTypeId);
        return shiftType && !isDayOff(shiftType);
      })
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, MAX_UPCOMING)
      .map(([date, shiftTypeId]) => {
        const shiftType = shiftTypeById.get(shiftTypeId)!;
        const override = overrides[date];
        const startTime = override?.startTime ?? shiftType.startTime ?? "";
        const endTime = override?.endTime ?? shiftType.endTime ?? "";
        const overnight = Boolean(startTime && endTime && endTime < startTime);
        return { date, shiftType, startTime, endTime, overnight };
      });
  }, [entries, overrides, shiftTypeById]);

  function goToReview(result: AnalyzeResponse) {
    router.push({
      pathname: "/import-review",
      params: {
        month: String(month),
        year: String(year),
        detectedShifts: JSON.stringify(result.detectedShifts ?? []),
        warnings: JSON.stringify(result.warnings ?? []),
      },
    });
  }

  async function runAnalysis(file: PickedFile, staffName?: string) {
    const allowed = await storage.consumeDailyUpload(DAILY_UPLOAD_LIMIT);
    if (!allowed) {
      Alert.alert(
        "Limite giornaliero raggiunto",
        `Hai già caricato ${DAILY_UPLOAD_LIMIT} documenti oggi. Riprova domani.`,
      );
      return;
    }

    setLoading(true);
    try {
      const knownCells = await storage.getCellCodeMemory();
      const result = await analyzeShiftFile(file, { month, year }, staffName, debugMode, knownCells);

      // Cio' che il documento ci ha insegnato resta sul telefono: al prossimo
      // caricamento quei simboli sono gia' noti.
      await storage.mergeCellCodeMemory(result.learnedCells ?? {});
      // I giorni il cui simbolo non e' noto restano "in sospeso": se l'utente
      // li completa a mano nel calendario, l'app impara da quel gesto.
      await storage.savePendingCells(
        Object.fromEntries((result.unresolvedCells ?? []).map((c) => [c.date, c.fingerprint])),
      );
      if (result.candidateNames && result.candidateNames.length > 0) {
        setPendingFile(file);
        setCandidateNames(result.candidateNames);
        return;
      }
      if (result.debugText) {
        // Le immagini possono pesare diversi MB come stringa: passano per una
        // variabile in memoria, non per i parametri di navigazione.
        setDebugImages(result.debugImages ?? []);
        router.push({
          pathname: "/debug-info",
          params: {
            debugText: result.debugText,
            month: String(month),
            year: String(year),
            detectedShifts: JSON.stringify(result.detectedShifts ?? []),
            warnings: JSON.stringify(result.warnings ?? []),
          },
        });
        return;
      }
      goToReview(result);
    } catch (error) {
      Alert.alert("Analisi non riuscita", error instanceof Error ? error.message : "Riprova.");
    } finally {
      setLoading(false);
    }
  }

  async function handlePickStaffName(name: string) {
    setCandidateNames([]);
    if (!pendingFile) return;
    // Ricorda la scelta: i prossimi caricamenti abbineranno il nome da soli.
    if (name !== userName) {
      const settings = await storage.getSettings();
      await storage.saveSettings({ ...settings, userName: name });
      setUserName(name);
    }
    await runAnalysis(pendingFile, name);
    setPendingFile(null);
  }

  function shiftMonth(delta: number) {
    let newMonth = month + delta;
    let newYear = year;
    if (newMonth < 1) { newMonth = 12; newYear -= 1; }
    if (newMonth > 12) { newMonth = 1; newYear += 1; }
    setMonth(newMonth);
    setYear(newYear);
  }

  async function handleFilePicked(file: PickedFile) {
    // Un caricamento senza nome utente non sa a quale riga abbinarsi, e
    // senza nessun turno definito non c'e' niente a cui mappare i codici
    // letti: in entrambi i casi il risultato sarebbe comunque inutile,
    // meglio chiederlo prima di consumare un'analisi.
    if (!userName.trim()) {
      Alert.alert(
        "Manca il tuo nome",
        "Serve il tuo nome prima di caricare un documento, altrimenti non sappiamo quale riga cercare. Vuoi inserirlo ora?",
        [
          { text: "Non ora", style: "cancel" },
          { text: "Vai alle Impostazioni", onPress: () => router.push("/(tabs)/settings") },
        ],
      );
      return;
    }
    if (shiftTypes.length === 0) {
      Alert.alert(
        "Nessun turno definito",
        "Crea almeno un tipo di turno (es. Mattina, Pomeriggio, Notte) prima di caricare un documento, altrimenti i codici trovati non avrebbero a cosa corrispondere. Vuoi crearlo ora?",
        [
          { text: "Non ora", style: "cancel" },
          { text: "Vai alle Impostazioni", onPress: () => router.push("/(tabs)/settings") },
        ],
      );
      return;
    }
    await runAnalysis(file, userName || undefined);
  }

  const todayLabel = now.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TutorialDim style={{ gap: theme.spacing.lg }}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heading}>Ciao{userName ? `, ${userName.split(" ")[0]}` : ""}</Text>
            <Text style={styles.dateLabel}>{todayLabel}</Text>
          </View>
          <TouchableOpacity style={styles.avatarButton} onPress={() => router.push("/(tabs)/settings")} activeOpacity={0.8}>
            <Ionicons name="id-card-outline" size={22} color={theme.colors.primary} />
          </TouchableOpacity>
        </View>

        <View style={styles.monthPicker}>
          <TouchableOpacity onPress={() => shiftMonth(-1)} style={styles.monthArrow}>
            <Ionicons name="chevron-back" size={18} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={styles.monthLabel}>
            Importazione per {MONTH_NAMES[month - 1].toLowerCase()} {year}
          </Text>
          <TouchableOpacity onPress={() => shiftMonth(1)} style={styles.monthArrow}>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.text} />
          </TouchableOpacity>
        </View>
      </TutorialDim>

      <TutorialTarget name="upload-button">
        <UploadButton loading={loading} onFilePicked={handleFilePicked} />
      </TutorialTarget>

      <TutorialDim style={{ gap: theme.spacing.lg }}>
        <View style={styles.statsRow}>
          <View style={styles.statTile}>
            <Ionicons name="briefcase-outline" size={18} color={theme.colors.primary} />
            <Text style={styles.statNumber}>{monthStats.workDays}</Text>
            <Text style={styles.statLabel}>Turni</Text>
          </View>
          <View style={styles.statTile}>
            <Ionicons name="moon-outline" size={18} color={theme.colors.primary} />
            <Text style={styles.statNumber}>{monthStats.restDays}</Text>
            <Text style={styles.statLabel}>Riposi</Text>
          </View>
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          <Text style={styles.sectionLabel}>Prossimi turni</Text>
          {upcomingShifts.length === 0 ? (
            <View style={styles.emptyUpcoming}>
              <Text style={styles.emptyUpcomingText}>Nessun turno in programma. Importa il prospetto per vederli qui.</Text>
            </View>
          ) : (
            upcomingShifts.map(({ date, shiftType, startTime, endTime, overnight }) => (
              <View key={date} style={styles.upcomingRow}>
                <View style={[styles.upcomingBar, { backgroundColor: shiftType.color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.upcomingLabel}>{shiftType.label}</Text>
                  <Text style={styles.upcomingTime}>
                    {formatUpcomingDate(date)}
                    {startTime && endTime ? ` · ${startTime}–${endTime}` : ""}
                    {overnight ? " · giorno successivo" : ""}
                  </Text>
                </View>
                <View style={[styles.upcomingBadge, { backgroundColor: withAlpha(shiftType.color, 0.16) }]}>
                  <Text style={[styles.upcomingBadgeText, { color: shiftType.color }]}>
                    {shiftType.label.trim().charAt(0).toUpperCase() || "?"}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        <Text style={styles.privacyNote}>
          Il file non viene mai salvato: viene analizzato ed eliminato subito dopo.
        </Text>
      </TutorialDim>

      <StaffPickerSheet
        visible={candidateNames.length > 0}
        names={candidateNames}
        onPick={handlePickStaffName}
        onClose={() => {
          setCandidateNames([]);
          setPendingFile(null);
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xl, gap: theme.spacing.lg },
  headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  heading: { ...theme.typography.title, color: theme.colors.text },
  dateLabel: { ...theme.typography.body, color: theme.colors.textMuted, textTransform: "capitalize" },
  avatarButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.primaryMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  monthPicker: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.colors.surfaceTint,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 8,
    gap: theme.spacing.sm,
  },
  monthArrow: { padding: 2 },
  monthLabel: { flex: 1, textAlign: "center", color: theme.colors.textMuted, fontSize: 13, fontFamily: theme.font.semiBold },
  statsRow: { flexDirection: "row", gap: theme.spacing.md },
  statTile: {
    flex: 1,
    backgroundColor: theme.colors.surfaceTint,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    gap: 2,
  },
  statNumber: { ...theme.typography.title, fontSize: 24, color: theme.colors.text, marginTop: 4 },
  statLabel: { color: theme.colors.textMuted, fontSize: 13, fontFamily: theme.font.semiBold },
  sectionLabel: { ...theme.typography.heading, color: theme.colors.text },
  emptyUpcoming: {
    backgroundColor: theme.colors.surfaceTint,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
  },
  emptyUpcomingText: { color: theme.colors.textMuted, fontSize: 13, lineHeight: 18 },
  upcomingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceTint,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
  },
  upcomingBar: { width: 4, alignSelf: "stretch", borderRadius: 2 },
  upcomingLabel: { ...theme.typography.subheading, color: theme.colors.text },
  upcomingTime: { color: theme.colors.textMuted, fontSize: 13, marginTop: 2 },
  upcomingBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  upcomingBadgeText: { fontSize: 16, fontFamily: theme.font.extraBold },
  privacyNote: { ...theme.typography.caption, color: theme.colors.textFaint, textAlign: "center" },
});
