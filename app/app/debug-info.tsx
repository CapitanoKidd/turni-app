import { router, useLocalSearchParams } from "expo-router";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { theme } from "../lib/theme";

/**
 * Mostra il testo grezzo di cosa ha rilevato il motore di analisi (Azure o
 * la lettura diretta del docx): a quale percorso e' ricorso per un PDF, e
 * le tabelle/celle riconosciute riga per riga. Serve a capire perche' un
 * turno manca invece di indovinare — visibile solo con "Modalita' debug"
 * attiva nelle Impostazioni.
 */
export default function DebugInfoScreen() {
  const params = useLocalSearchParams<{
    debugText: string;
    month: string;
    year: string;
    detectedShifts: string;
    warnings: string;
  }>();

  function handleContinue() {
    router.replace({
      pathname: "/import-review",
      params: {
        month: params.month,
        year: params.year,
        detectedShifts: params.detectedShifts,
        warnings: params.warnings,
      },
    });
  }

  return (
    <View style={styles.container}>
      <Text style={styles.hint}>
        Quello che ha rilevato davvero il motore di analisi. Utile da copiare e mandare in caso di problemi.
      </Text>

      <ScrollView horizontal style={styles.textBox}>
        <ScrollView contentContainerStyle={{ padding: theme.spacing.md }}>
          <Text selectable style={styles.debugText}>
            {params.debugText || "(nessuna informazione di debug disponibile)"}
          </Text>
        </ScrollView>
      </ScrollView>
      <Text style={styles.selectHint}>Tieni premuto sul testo per selezionarlo e copiarlo.</Text>

      <TouchableOpacity style={styles.primaryButton} onPress={handleContinue}>
        <Text style={styles.primaryButtonText}>Continua alla revisione</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background, padding: theme.spacing.lg, gap: theme.spacing.md },
  hint: { color: theme.colors.textMuted, fontSize: 13 },
  textBox: { flex: 1, backgroundColor: theme.colors.surface, borderRadius: theme.radius.md },
  debugText: { color: theme.colors.text, fontSize: 12, fontFamily: "monospace" },
  selectHint: { color: theme.colors.textMuted, fontSize: 11, textAlign: "center" },
  primaryButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
    alignItems: "center",
  },
  primaryButtonText: { color: theme.colors.primaryText, fontWeight: "700" },
});
