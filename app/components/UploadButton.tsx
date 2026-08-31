import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { theme } from "../lib/theme";
import type { PickedFile } from "../lib/api";

interface UploadButtonProps {
  loading: boolean;
  onFilePicked: (file: PickedFile) => void;
}

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * Pulsante unico per caricare la griglia turni. Chiede subito quale fonte
 * usare (fotocamera, galleria o file) cosi' l'utente non deve capire in
 * anticipo cosa scegliere: e' l'app a proporre le tre opzioni possibili. Il
 * "pulsante" e' l'intera card (anche la pillola bianca dentro non ha un suo
 * onPress separato, e' solo decorativa): toccare ovunque sulla card apre le
 * stesse opzioni.
 */
export function UploadButton({ loading, onFilePicked }: UploadButtonProps) {
  async function handlePress() {
    if (loading) return;
    Alert.alert(
      "Carica turni",
      "Come vuoi caricare la griglia dei turni?",
      [
        { text: "Scatta una foto", onPress: pickFromCamera },
        { text: "Scegli da galleria", onPress: pickFromGallery },
        { text: "Scegli un file (PDF o Word)", onPress: pickDocument },
        { text: "Annulla", style: "cancel" },
      ],
      // Toccando fuori dal popup si chiude senza fare nulla (come "Annulla"),
      // cosi' un tocco accidentale sul pulsante non blocca l'utente li'.
      { cancelable: true },
    );
  }

  async function pickFromCamera() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permesso negato", "Serve il permesso fotocamera per scattare la foto della griglia turni.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.9 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    onFilePicked({ uri: asset.uri, name: asset.fileName ?? "turni.jpg", mimeType: asset.mimeType ?? "image/jpeg" });
  }

  async function pickFromGallery() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permesso negato", "Serve il permesso galleria per scegliere la foto della griglia turni.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.9 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    onFilePicked({ uri: asset.uri, name: asset.fileName ?? "turni.jpg", mimeType: asset.mimeType ?? "image/jpeg" });
  }

  async function pickDocument() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", DOCX_MIME],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    onFilePicked({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? "application/pdf" });
  }

  return (
    <TouchableOpacity style={styles.card} onPress={handlePress} disabled={loading} activeOpacity={0.9}>
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={theme.colors.primaryText} />
          <Text style={styles.title}>Analisi in corso…</Text>
        </View>
      ) : (
        <>
          <View style={styles.iconBadge}>
            <Ionicons name="scan-outline" size={26} color={theme.colors.primaryText} />
          </View>
          <Text style={styles.title}>Importa il nuovo prospetto</Text>
          <Text style={styles.subtitle}>Foto, PDF o Word. Il documento resta sul dispositivo.</Text>
          <View style={styles.pillButton}>
            <Ionicons name="camera-outline" size={16} color={theme.colors.primary} />
            <Text style={styles.pillButtonText}>Inizia importazione</Text>
          </View>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    alignItems: "flex-start",
    gap: 6,
    ...theme.shadow.elevated,
    shadowColor: theme.colors.primaryDark,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.md,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.spacing.sm,
  },
  title: { fontSize: 20, fontFamily: theme.font.extraBold, color: theme.colors.primaryText, letterSpacing: -0.2 },
  subtitle: { fontSize: 13, fontFamily: theme.font.medium, color: theme.colors.primaryText, opacity: 0.8, lineHeight: 18 },
  pillButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: theme.colors.primaryText,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
    marginTop: theme.spacing.sm,
  },
  pillButtonText: { fontSize: 14, fontFamily: theme.font.bold, color: theme.colors.primary },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
});
