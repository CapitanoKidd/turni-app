import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { StaffPickerSheet } from "../../components/StaffPickerSheet";
import { UploadButton } from "../../components/UploadButton";
import { analyzeShiftFile, type PickedFile } from "../../lib/api";
import { setDebugImages } from "../../lib/debugImageStore";
import { storage } from "../../lib/storage";
import { theme } from "../../lib/theme";
import { TutorialTarget } from "../../lib/tutorial";
import type { AnalyzeResponse, ShiftType } from "../../lib/types";

/** Caricamenti (foto/PDF/Word) concessi per giorno a un dispositivo: protezione contro l'uso eccessivo dell'analisi, non contro l'abuso deliberato (vedi storage.consumeDailyUpload). */
const DAILY_UPLOAD_LIMIT = 4;

const MONTH_NAMES = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

export default function HomeScreen() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [loading, setLoading] = useState(false);
  const [userName, setUserName] = useState("");
  const [debugMode, setDebugMode] = useState(false);
  const [shiftTypes, setShiftTypes] = useState<ShiftType[]>([]);
  const [pendingFile, setPendingFile] = useState<PickedFile | null>(null);
  const [candidateNames, setCandidateNames] = useState<string[]>([]);

  useFocusEffect(
    useCallback(() => {
      Promise.all([storage.getSettings(), storage.getShiftTypes()]).then(([s, types]) => {
        setUserName(s.userName);
        setDebugMode(s.debugMode);
        setShiftTypes(types);
      });
    }, []),
  );

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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Ciao 👋</Text>
      <Text style={styles.paragraph}>
        Carica la griglia dei turni del mese: la analizziamo, ti mostriamo i turni trovati e, se confermi, li
        importiamo nel calendario.
      </Text>

      <View style={styles.monthPicker}>
        <TouchableOpacity onPress={() => shiftMonth(-1)} style={styles.monthArrow}>
          <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.monthLabel}>
          {MONTH_NAMES[month - 1]} {year}
        </Text>
        <TouchableOpacity onPress={() => shiftMonth(1)} style={styles.monthArrow}>
          <Ionicons name="chevron-forward" size={22} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      <TutorialTarget name="upload-button">
        <UploadButton loading={loading} onFilePicked={handleFilePicked} />
      </TutorialTarget>

      <View style={styles.stepsCard}>
        <Step number={1} text="Carica la foto, il PDF o il Word della griglia turni" />
        <Step number={2} text="Controlla i turni rilevati e correggi se serve" />
        <Step number={3} text="Conferma: i turni finiscono nel calendario e (se attivo) parte la sveglia" />
      </View>

      <Text style={styles.privacyNote}>
        Il file non viene mai salvato: viene analizzato ed eliminato subito dopo.
      </Text>

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

function Step({ number, text }: { number: number; text: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepNumber}>
        <Text style={styles.stepNumberText}>{number}</Text>
      </View>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, gap: theme.spacing.lg },
  heading: { fontSize: 26, fontWeight: "800", color: theme.colors.text },
  paragraph: { color: theme.colors.textMuted, fontSize: 15, lineHeight: 21 },
  monthPicker: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  monthArrow: { padding: theme.spacing.xs },
  monthLabel: { color: theme.colors.text, fontSize: 16, fontWeight: "700", textTransform: "capitalize" },
  stepsCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  step: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
  stepNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumberText: { color: theme.colors.primary, fontWeight: "700" },
  stepText: { color: theme.colors.textMuted, flex: 1, fontSize: 13 },
  privacyNote: { color: theme.colors.textMuted, fontSize: 12, textAlign: "center" },
});
