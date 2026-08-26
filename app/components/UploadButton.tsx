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
 * anticipo cosa scegliere: e' l'app a proporre le tre opzioni possibili.
 */
export function UploadButton({ loading, onFilePicked }: UploadButtonProps) {
  async function handlePress() {
    if (loading) return;
    Alert.alert("Carica turni", "Come vuoi caricare la griglia dei turni?", [
      { text: "Scatta una foto", onPress: pickFromCamera },
      { text: "Scegli da galleria", onPress: pickFromGallery },
      { text: "Scegli un file (PDF o Word)", onPress: pickDocument },
      { text: "Annulla", style: "cancel" },
    ]);
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
    <TouchableOpacity style={styles.card} onPress={handlePress} disabled={loading} activeOpacity={0.8}>
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={theme.colors.primaryText} />
          <Text style={styles.title}>Analisi in corso…</Text>
        </View>
      ) : (
        <>
          <Text style={styles.icon}>📎</Text>
          <Text style={styles.title}>Carica turni</Text>
          <Text style={styles.subtitle}>Foto, PDF o Word della griglia turni</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.lg,
    paddingVertical: theme.spacing.xl,
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  icon: { fontSize: 40 },
  title: { fontSize: 18, fontWeight: "700", color: theme.colors.primaryText },
  subtitle: { fontSize: 13, color: theme.colors.primaryText, opacity: 0.8 },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
});
