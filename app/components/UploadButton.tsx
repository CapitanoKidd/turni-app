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
 * anticipo cosa scegliere: e' l'app a proporre le tre opzioni possibili.
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
    <TouchableOpacity style={styles.card} onPress={handlePress} disabled={loading} activeOpacity={0.85}>
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={theme.colors.primaryText} />
          <Text style={styles.title}>Analisi in corso…</Text>
        </View>
      ) : (
        <>
          <View style={styles.iconBadge}>
            <Ionicons name="cloud-upload-outline" size={30} color={theme.colors.primaryText} />
          </View>
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
    gap: 6,
    ...theme.shadow.elevated,
    shadowColor: theme.colors.primary,
  },
  iconBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(3,32,47,0.14)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.spacing.xs,
  },
  title: { fontSize: 18, fontWeight: "800", color: theme.colors.primaryText, letterSpacing: -0.2 },
  subtitle: { fontSize: 13, color: theme.colors.primaryText, opacity: 0.75 },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
});
