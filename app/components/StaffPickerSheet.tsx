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
          <View style={styles.handle} />
          <Text style={styles.title}>Quale sei tu?</Text>
          <Text style={styles.subtitle}>
            Questo documento contiene i turni di piu' persone. Scegli il tuo nome dall'elenco.
          </Text>

          <ScrollView style={styles.list}>
            {names.map((name) => (
              <TouchableOpacity key={name} style={styles.option} onPress={() => onPick(name)} activeOpacity={0.75}>
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
  backdrop: { flex: 1, backgroundColor: "rgba(4,8,16,0.72)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: theme.colors.surfaceElevated,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
    maxHeight: "75%",
    ...theme.shadow.elevated,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    marginBottom: theme.spacing.sm,
  },
  title: { ...theme.typography.heading, color: theme.colors.text, marginBottom: theme.spacing.xs },
  subtitle: { color: theme.colors.textMuted, fontSize: 13, lineHeight: 18, marginBottom: theme.spacing.md },
  list: { marginBottom: theme.spacing.sm },
  option: {
    padding: theme.spacing.md,
    borderRadius: theme.radius.sm,
    marginBottom: theme.spacing.xs,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  optionText: { color: theme.colors.text, fontSize: 15, fontFamily: theme.font.semiBold },
  closeButton: {
    marginTop: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    alignItems: "center",
  },
  closeButtonText: { color: theme.colors.textMuted, fontFamily: theme.font.semiBold },
});
