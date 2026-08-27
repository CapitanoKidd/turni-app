import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { theme } from "../lib/theme";

interface StaffPickerSheetProps {
  visible: boolean;
  names: string[];
  onPick: (name: string) => void;
  onClose: () => void;
}

/**
 * Il documento caricato contiene i turni di piu' persone (una turnistica di
 * reparto): questo foglio chiede all'utente di scegliere la propria riga
 * invece di indovinarla. La scelta viene poi ricordata in Impostazioni cosi'
 * non verra' richiesta di nuovo ai prossimi caricamenti.
 */
export function StaffPickerSheet({ visible, names, onPick, onClose }: StaffPickerSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Quale sei tu?</Text>
          <Text style={styles.subtitle}>
            Questo documento contiene i turni di piu' persone. Scegli il tuo nome dall'elenco.
          </Text>

          <ScrollView style={styles.list}>
            {names.map((name) => (
              <TouchableOpacity key={name} style={styles.option} onPress={() => onPick(name)}>
                <Text style={styles.optionText}>{name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>Annulla</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    maxHeight: "75%",
  },
  title: { color: theme.colors.text, fontSize: 18, fontWeight: "700", marginBottom: theme.spacing.xs },
  subtitle: { color: theme.colors.textMuted, fontSize: 13, marginBottom: theme.spacing.md },
  list: { marginBottom: theme.spacing.sm },
  option: {
    padding: theme.spacing.sm,
    borderRadius: theme.radius.sm,
    marginBottom: theme.spacing.xs,
    backgroundColor: theme.colors.surfaceAlt,
  },
  optionText: { color: theme.colors.text, fontSize: 15 },
  closeButton: {
    marginTop: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    alignItems: "center",
  },
  closeButtonText: { color: theme.colors.textMuted, fontWeight: "600" },
});
