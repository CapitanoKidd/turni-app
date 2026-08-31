import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ensureNotificationPermission, scheduleAlarmsForEntries } from "../lib/notifications";
import { storage } from "../lib/storage";
import { theme } from "../lib/theme";
import type { CalendarEntries, DetectedShift, ShiftType } from "../lib/types";

const MONTH_NAMES = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

export default function ImportReviewScreen() {
  const params = useLocalSearchParams<{
    month: string;
    year: string;
    detectedShifts: string;
    warnings: string;
  }>();

  const month = Number(params.month);
  const year = Number(params.year);
  const detectedShifts: DetectedShift[] = useMemo(
    () => JSON.parse(params.detectedShifts || "[]"),
    [params.detectedShifts],
  );
  const warnings: string[] = useMemo(() => JSON.parse(params.warnings || "[]"), [params.warnings]);

  const [shiftTypes, setShiftTypes] = useState<ShiftType[]>([]);
  const [saving, setSaving] = useState(false);

  // Ricarica i tipi di turno ogni volta che si torna su questa schermata
  // (es. dopo aver creato un nuovo turno da "shift-type-editor").
  useFocusEffect(
    useCallback(() => {
      storage.getShiftTypes().then(setShiftTypes);
    }, []),
  );

  const shiftTypeByLabel = useMemo(() => {
    const map = new Map<string, ShiftType>();
    for (const shift of shiftTypes) map.set(shift.label.trim().toUpperCase(), shift);
    return map;
  }, [shiftTypes]);

  // Un giorno "vuoto" (nessun codice riconosciuto nella cella) non e' un
  // codice da definire: e' semplicemente un giorno che l'utente completera'
  // a mano dopo l'importazione, toccandolo nel calendario.
  const uniqueCodes = useMemo(() => {
    const seen = new Set<string>();
    return detectedShifts
      .map((s) => s.rawCode)
      .filter((code) => code.trim().length > 0)
      .filter((code) => (seen.has(code) ? false : seen.add(code)));
  }, [detectedShifts]);

  const unmappedCodes = uniqueCodes.filter((code) => !shiftTypeByLabel.has(code.trim().toUpperCase()));
  const allMapped = detectedShifts.length > 0 && unmappedCodes.length === 0;
  const recognizedCount = useMemo(
    () => detectedShifts.filter((s) => s.rawCode.trim().length > 0).length,
    [detectedShifts],
  );

  async function handleImport() {
    if (!allMapped) return;
    setSaving(true);
    try {
      const existingEntries = await storage.getCalendarEntries();
      const newEntries: CalendarEntries = {};
      for (const shift of detectedShifts) {
        const shiftType = shiftTypeByLabel.get(shift.rawCode.trim().toUpperCase());
        if (shiftType) newEntries[shift.date] = shiftType.id;
      }
      await storage.saveCalendarEntries({ ...existingEntries, ...newEntries });

      // La sveglia e' un attributo del tipo di turno: se qualcuno dei turni
      // importati ne prevede una, si offre di programmarla, senza bisogno
      // di un interruttore globale attivo.
      const hasAnyAlarm = Object.values(newEntries).some((id) => {
        const shiftType = shiftTypes.find((s) => s.id === id);
        return shiftType?.alarmEnabled;
      });
      if (hasAnyAlarm) {
        const proceed = await confirmAlarms();
        if (proceed) {
          const granted = await ensureNotificationPermission();
          if (granted) {
            await scheduleAlarmsForEntries(newEntries, shiftTypes);
          } else {
            Alert.alert("Permesso negato", "Senza il permesso notifiche le sveglie non possono essere impostate.");
          }
        }
      }

      router.replace("/(tabs)/calendar");
    } finally {
      setSaving(false);
    }
  }

  function confirmAlarms(): Promise<boolean> {
    return new Promise((resolve) => {
      Alert.alert("Impostare le sveglie?", "Verranno programmate le sveglie per i turni importati che le prevedono.", [
        { text: "No, solo calendario", style: "cancel", onPress: () => resolve(false) },
        { text: "Si', imposta sveglie", onPress: () => resolve(true) },
      ]);
    });
  }

  function openShiftTypeEditor(prefillLabel?: string) {
    router.push({ pathname: "/shift-type-editor", params: prefillLabel ? { prefillLabel } : {} });
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>
        {MONTH_NAMES[month - 1]} {year}
      </Text>
      <Text style={styles.subheading}>
        {recognizedCount} di {detectedShifts.length} giorni con un turno riconosciuto
      </Text>

      {warnings.map((warning, i) => (
        <View key={i} style={styles.warningBox}>
          <Ionicons name="warning-outline" size={16} color={theme.colors.warning} />
          <Text style={styles.warningText}>{warning}</Text>
        </View>
      ))}

      {unmappedCodes.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Turni da definire</Text>
          <Text style={styles.sectionHint}>
            Questi codici sono stati trovati nel documento ma non corrispondono a nessun turno che conosci: definiscili
            una volta sola, verranno applicati a tutte le date corrispondenti.
          </Text>
          {unmappedCodes.map((code) => (
            <TouchableOpacity key={code} style={styles.unmappedRow} onPress={() => openShiftTypeEditor(code)} activeOpacity={0.8}>
              <Text style={styles.unmappedCode}>{code}</Text>
              <View style={styles.unmappedActionRow}>
                <Text style={styles.unmappedAction}>Definisci</Text>
                <Ionicons name="chevron-forward" size={16} color={theme.colors.primary} />
              </View>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Anteprima</Text>
        <Text style={styles.sectionHint}>
          I giorni "vuoto" non avevano nessun codice riconoscibile nel documento: dopo l'importazione puoi
          assegnarli a mano toccandoli nel calendario, anche come riposo o ferie.
        </Text>
        {detectedShifts.map((shift, index) => {
          const isBlank = shift.rawCode.trim().length === 0;
          const shiftType = isBlank ? undefined : shiftTypeByLabel.get(shift.rawCode.trim().toUpperCase());
          return (
            <View key={`${shift.date}-${index}`} style={styles.previewRow}>
              <Text style={styles.previewDate}>{formatDayLabel(shift.date)}</Text>
              <View style={styles.previewShift}>
                {shiftType ? <View style={[styles.dot, { backgroundColor: shiftType.color }]} /> : null}
                <Text
                  style={[
                    styles.previewCode,
                    isBlank ? styles.previewCodeBlank : !shiftType && styles.previewCodePending,
                  ]}
                >
                  {isBlank ? "vuoto" : shift.rawCode}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      <TouchableOpacity
        style={[styles.importButton, !allMapped && styles.importButtonDisabled]}
        onPress={handleImport}
        disabled={!allMapped || saving}
      >
        <Text style={styles.importButtonText}>
          {saving ? "Importazione…" : allMapped ? "Importa nel calendario" : "Definisci tutti i turni per continuare"}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function formatDayLabel(dateIso: string): string {
  const [year, month, day] = dateIso.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, gap: theme.spacing.md, paddingBottom: theme.spacing.xl },
  heading: { ...theme.typography.title, fontSize: 24, color: theme.colors.text },
  subheading: { color: theme.colors.textMuted, marginBottom: theme.spacing.sm },
  warningBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.warningMuted,
    borderRadius: theme.radius.sm,
    padding: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.warning,
  },
  warningText: { color: theme.colors.text, fontSize: 13, flex: 1, lineHeight: 18 },
  section: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadow.card,
  },
  sectionTitle: { ...theme.typography.subheading, color: theme.colors.text },
  sectionHint: { color: theme.colors.textMuted, fontSize: 12, lineHeight: 17 },
  unmappedRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.dangerMuted,
  },
  unmappedCode: { color: theme.colors.text, fontWeight: "700" },
  unmappedActionRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  unmappedAction: { color: theme.colors.primary, fontWeight: "600" },
  previewRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: theme.spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  previewDate: { color: theme.colors.textMuted, fontSize: 13, textTransform: "capitalize" },
  previewShift: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  previewCode: { color: theme.colors.text, fontWeight: "600" },
  previewCodePending: { color: theme.colors.danger },
  previewCodeBlank: { color: theme.colors.textMuted, fontStyle: "italic", fontWeight: "400" },
  importButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
    alignItems: "center",
    ...theme.shadow.card,
    shadowColor: theme.colors.primary,
  },
  importButtonDisabled: { backgroundColor: theme.colors.surfaceAlt, shadowOpacity: 0, elevation: 0 },
  importButtonText: { color: theme.colors.primaryText, fontWeight: "700", fontSize: 16 },
});
