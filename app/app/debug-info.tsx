import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
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
  const [openImageIndex, setOpenImageIndex] = useState<number | null>(null);

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
            {debugImages.length === 1 ? "Cosa e' stato inviato ad Azure" : `Cosa e' stato inviato ad Azure (${debugImages.length} pagine)`}
          </Text>
          <Text style={styles.hint}>
            Ad Azure viene inviato un PDF, non un'immagine: questa e' esattamente la pagina inviata, disegnata come
            immagine solo per potertela mostrare. Tocca per aprirla a schermo intero e ingrandirla.
          </Text>
          {debugImages.map((uri, i) => (
            <DebugImageThumbnail key={i} uri={uri} onPress={() => setOpenImageIndex(i)} />
          ))}
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

      <ZoomableImageModal
        uri={openImageIndex !== null ? debugImages[openImageIndex] : null}
        onClose={() => setOpenImageIndex(null)}
      />
    </View>
  );
}

/** Anteprima dell'immagine a piena larghezza, con le proporzioni vere (mai in un riquadro quadrato fisso: le nostre immagini sono molto larghe e basse, in un riquadro quadrato si vedrebbe solo spazio bianco). */
function DebugImageThumbnail({ uri, onPress }: { uri: string; onPress: () => void }) {
  const { width: windowWidth } = useWindowDimensions();
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    Image.getSize(
      uri,
      (width, height) => {
        if (!cancelled && height > 0) setAspectRatio(width / height);
      },
      () => {
        // Se non si riesce a leggere la dimensione, si mostra comunque un
        // riquadro (proporzione ragionevole di ripiego) invece di niente.
        if (!cancelled) setAspectRatio(4);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [uri]);

  const previewWidth = windowWidth - theme.spacing.lg * 2;

  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={styles.thumbnailWrapper}>
      {aspectRatio ? (
        <Image
          source={{ uri }}
          style={{ width: previewWidth, height: previewWidth / aspectRatio }}
          resizeMode="contain"
        />
      ) : (
        <View style={[styles.thumbnailLoading, { width: previewWidth }]} />
      )}
      <Text style={styles.thumbnailHint}>Tocca per aprirla e ingrandirla</Text>
    </TouchableOpacity>
  );
}

/**
 * Vista a schermo intero per guardare l'immagine nel dettaglio, con zoom a
 * pulsanti e scorrimento in entrambe le direzioni.
 *
 * Nota: NON si usa lo zoom a pizzico di ScrollView
 * (minimumZoomScale/maximumZoomScale) perche' e' supportato solo su iOS: su
 * Android non farebbe assolutamente nulla, lasciando l'immagine bloccata.
 */
function ZoomableImageModal({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    setZoom(1); // ogni apertura riparte dalla vista intera
    if (!uri) {
      setAspectRatio(null);
      return;
    }
    let cancelled = false;
    Image.getSize(
      uri,
      (width, height) => {
        if (!cancelled && height > 0) setAspectRatio(width / height);
      },
      () => {
        if (!cancelled) setAspectRatio(1);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [uri]);

  if (!uri) return null;

  // A zoom 1 l'immagine sta tutta nello schermo; sopra, si ingrandisce e si
  // scorre per esplorarla.
  const baseWidth = aspectRatio && aspectRatio > windowWidth / windowHeight
    ? windowWidth
    : (aspectRatio ?? 1) * windowHeight;
  const imageWidth = baseWidth * zoom;
  const imageHeight = aspectRatio ? imageWidth / aspectRatio : windowHeight * zoom;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.modalScrollContent}
          maximumZoomScale={ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
          minimumZoomScale={1}
        >
          <ScrollView horizontal contentContainerStyle={styles.modalScrollContent}>
            {aspectRatio ? (
              <Image source={{ uri }} style={{ width: imageWidth, height: imageHeight }} resizeMode="contain" />
            ) : null}
          </ScrollView>
        </ScrollView>

        <View style={styles.zoomBar}>
          {ZOOM_LEVELS.map((level) => (
            <TouchableOpacity
              key={level}
              style={[styles.zoomButton, zoom === level && styles.zoomButtonActive]}
              onPress={() => setZoom(level)}
            >
              <Text style={[styles.zoomButtonText, zoom === level && styles.zoomButtonTextActive]}>{level}x</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.zoomButton} onPress={onClose}>
            <Text style={styles.zoomButtonText}>✕ Chiudi</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const ZOOM_LEVELS = [1, 2, 4, 8];

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background, padding: theme.spacing.lg, gap: theme.spacing.md },
  hint: { color: theme.colors.textMuted, fontSize: 13 },
  imagesSection: { gap: theme.spacing.xs },
  imagesTitle: { color: theme.colors.text, fontWeight: "700", fontSize: 14 },
  thumbnailWrapper: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    overflow: "hidden",
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  thumbnailLoading: { height: 120, backgroundColor: theme.colors.surfaceAlt },
  thumbnailHint: {
    color: theme.colors.textMuted,
    fontSize: 11,
    paddingVertical: 4,
  },
  textBox: { flex: 1, backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border },
  debugText: { color: theme.colors.text, fontSize: 12, fontFamily: "monospace" },
  selectHint: { color: theme.colors.textMuted, fontSize: 11, textAlign: "center" },
  primaryButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
    alignItems: "center",
    ...theme.shadow.card,
    shadowColor: theme.colors.primary,
  },
  primaryButtonText: { color: theme.colors.primaryText, fontWeight: "700" },
  modalBackdrop: { flex: 1, backgroundColor: "#000000ee" },
  modalScrollContent: { flexGrow: 1, alignItems: "center", justifyContent: "center" },
  zoomBar: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
    backgroundColor: "#000000cc",
  },
  zoomButton: {
    backgroundColor: "#ffffff22",
    borderRadius: theme.radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  zoomButtonActive: { backgroundColor: theme.colors.primary },
  zoomButtonText: { color: "#fff", fontWeight: "700" },
  zoomButtonTextActive: { color: theme.colors.primaryText },
});
