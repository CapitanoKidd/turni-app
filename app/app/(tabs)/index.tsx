import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { UploadButton } from "../../components/UploadButton";
import { analyzeShiftFile, type PickedFile } from "../../lib/api";
import { theme } from "../../lib/theme";

const MONTH_NAMES = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

export default function HomeScreen() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [loading, setLoading] = useState(false);

  function shiftMonth(delta: number) {
    let newMonth = month + delta;
    let newYear = year;
    if (newMonth < 1) { newMonth = 12; newYear -= 1; }
    if (newMonth > 12) { newMonth = 1; newYear += 1; }
    setMonth(newMonth);
    setYear(newYear);
  }

  async function handleFilePicked(file: PickedFile) {
    setLoading(true);
    try {
      const result = await analyzeShiftFile(file, { month, year });
      router.push({
        pathname: "/import-review",
        params: {
          month: String(month),
          year: String(year),
          detectedShifts: JSON.stringify(result.detectedShifts ?? []),
          warnings: JSON.stringify(result.warnings ?? []),
        },
      });
    } catch (error) {
      Alert.alert("Analisi non riuscita", error instanceof Error ? error.message : "Riprova.");
    } finally {
      setLoading(false);
    }
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

      <UploadButton loading={loading} onFilePicked={handleFilePicked} />

      <View style={styles.stepsCard}>
        <Step number={1} text="Carica la foto, il PDF o il Word della griglia turni" />
        <Step number={2} text="Controlla i turni rilevati e correggi se serve" />
        <Step number={3} text="Conferma: i turni finiscono nel calendario e (se attivo) parte la sveglia" />
      </View>

      <Text style={styles.privacyNote}>
        Il file non viene mai salvato: viene analizzato ed eliminato subito dopo.
      </Text>
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
