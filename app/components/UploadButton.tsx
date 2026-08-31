import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { theme } from "../lib/theme";
import type { PickedFile } from "../lib/api";

interface UploadButtonProps {
  loading: boolean;
  onFilePicked: (file: PickedFile) => void;
}

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type SourceOption = { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void };

/**
 * Pulsante unico per caricare la griglia turni. Chiede subito quale fonte
 * usare (fotocamera, galleria o file) cosi' l'utente non deve capire in
 * anticipo cosa scegliere: e' l'app a proporre le tre opzioni possibili. Il
 * "pulsante" e' l'intera card (anche la pillola bianca dentro non ha un suo
 * onPress separato, e' solo decorativa): toccare ovunque sulla card apre le
 * stesse opzioni.
 *
 * Il menu di scelta e' un foglio disegnato da noi (stesso stile del resto
 * dell'app), non l'Alert.alert nativo di sistema: quest'ultimo e' un
 * dialogo del sistema operativo, non un componente React Native, quindi
 * non si puo' restilizzare — resterebbe sempre bianco col font di sistema
 * a prescindere da qualunque tema dell'app.
 */
export function UploadButton({ loading, onFilePicked }: UploadButtonProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  function choose(action: () => void) {
    setPickerOpen(false);
    action();
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

  const options: SourceOption[] = [
    { icon: "camera-outline", label: "Scatta una foto", onPress: pickFromCamera },
    { icon: "images-outline", label: "Scegli da galleria", onPress: pickFromGallery },
    { icon: "document-text-outline", label: "Scegli un file (PDF o Word)", onPress: pickDocument },
  ];

  return (
    <>
      <TouchableOpacity
        style={styles.card}
        onPress={() => setPickerOpen(true)}
        disabled={loading}
        activeOpacity={0.9}
      >
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

      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setPickerOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Carica turni</Text>
            <Text style={styles.sheetSubtitle}>Come vuoi caricare la griglia dei turni?</Text>

            <View style={{ gap: theme.spacing.sm }}>
              {options.map((option) => (
                <TouchableOpacity
                  key={option.label}
                  style={styles.optionRow}
                  onPress={() => choose(option.onPress)}
                  activeOpacity={0.75}
                >
                  <View style={styles.optionIcon}>
                    <Ionicons name={option.icon} size={20} color={theme.colors.primary} />
                  </View>
                  <Text style={styles.optionLabel}>{option.label}</Text>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textFaint} />
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.cancelButton} onPress={() => setPickerOpen(false)}>
              <Text style={styles.cancelButtonText}>Annulla</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
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
  backdrop: { flex: 1, backgroundColor: "rgba(4,8,16,0.72)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: theme.colors.surfaceElevated,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
    gap: theme.spacing.md,
    ...theme.shadow.elevated,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    marginBottom: theme.spacing.xs,
  },
  sheetTitle: { ...theme.typography.heading, color: theme.colors.text },
  sheetSubtitle: { color: theme.colors.textMuted, fontSize: 13, marginTop: -theme.spacing.sm },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.md,
    padding: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  optionIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: theme.colors.primaryMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  optionLabel: { flex: 1, color: theme.colors.text, fontSize: 15, fontFamily: theme.font.semiBold },
  cancelButton: {
    alignItems: "center",
    paddingVertical: theme.spacing.sm,
  },
  cancelButtonText: { color: theme.colors.textMuted, fontFamily: theme.font.semiBold },
});
