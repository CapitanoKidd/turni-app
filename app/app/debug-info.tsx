import { router, useLocalSearchParams } from "expo-router";
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { getDebugImages } from "../lib/debugImageStore";
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
  // Se il PDF e' stato rasterizzato, queste sono le immagini esatte mandate
  // ad Azure: utili per vedere con i propri occhi se un giorno manca perche'
  // la cella era davvero vuota/illeggibile anche nell'immagine, o perche' la
  // rasterizzazione ha tagliato/rovinato qualcosa che nel PDF c'era.
  const debugImages = getDebugImages();

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

      {debugImages.length > 0 ? (
        <View style={styles.imagesSection}>
          <Text style={styles.imagesTitle}>
            {debugImages.length === 1
              ? "Immagine mandata ad Azure"
              : `Immagini mandate ad Azure (${debugImages.length})`}
          </Text>
          <Text style={styles.hint}>
            Il PDF non bastava da solo: questa pagina e' stata trasformata in immagine e rimandata ad Azure. Guardala
            per capire se un giorno mancante era gia' vuoto qui, o se la trasformazione ha rovinato qualcosa.
          </Text>
          <ScrollView horizontal contentContainerStyle={styles.imagesRow}>
            {debugImages.map((uri, i) => (
              <ScrollView key={i} style={styles.imageFrame} horizontal>
                <ScrollView>
                  <Image source={{ uri }} style={styles.debugImage} resizeMode="contain" />
                </ScrollView>
              </ScrollView>
            ))}
          </ScrollView>
        </View>
      ) : null}

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

const IMAGE_FRAME_SIZE = 320;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background, padding: theme.spacing.lg, gap: theme.spacing.md },
  hint: { color: theme.colors.textMuted, fontSize: 13 },
  imagesSection: { gap: theme.spacing.xs },
  imagesTitle: { color: theme.colors.text, fontWeight: "700", fontSize: 14 },
  imagesRow: { gap: theme.spacing.sm },
  imageFrame: {
    width: IMAGE_FRAME_SIZE,
    height: IMAGE_FRAME_SIZE,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
  },
  debugImage: { width: IMAGE_FRAME_SIZE * 2, height: IMAGE_FRAME_SIZE * 2 },
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
