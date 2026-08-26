import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { theme } from "../lib/theme";
import type { ShiftType } from "../lib/types";

interface DayShiftSheetProps {
  visible: boolean;
  dateIso: string | null;
  shiftTypes: ShiftType[];
  currentShiftTypeId?: string;
  onClose: () => void;
  onSelectShiftType: (shiftTypeId: string) => void;
  onRemoveShift: () => void;
  onCreateShiftType: () => void;
}

function formatDateLabel(dateIso: string): string {
  const [year, month, day] = dateIso.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
}

export function DayShiftSheet({
  visible,
  dateIso,
  shiftTypes,
  currentShiftTypeId,
  onClose,
  onSelectShiftType,
  onRemoveShift,
  onCreateShiftType,
}: DayShiftSheetProps) {
  if (!dateIso) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>{formatDateLabel(dateIso)}</Text>

          <ScrollView style={styles.list}>
            {shiftTypes.length === 0 ? (
              <Text style={styles.emptyText}>
                Non hai ancora nessun tipo di turno. Creane uno per assegnarlo a questo giorno.
              </Text>
            ) : (
              shiftTypes.map((shift) => (
                <TouchableOpacity
                  key={shift.id}
                  style={[styles.option, currentShiftTypeId === shift.id && styles.optionSelected]}
                  onPress={() => onSelectShiftType(shift.id)}
                >
                  <View style={[styles.dot, { backgroundColor: shift.color }]} />
                  <Text style={styles.optionText}>
                    {shift.label} · {shift.startTime}-{shift.endTime}
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>

          <TouchableOpacity style={styles.secondaryButton} onPress={onCreateShiftType}>
            <Text style={styles.secondaryButtonText}>+ Nuovo tipo di turno</Text>
          </TouchableOpacity>

          {currentShiftTypeId ? (
            <TouchableOpacity style={styles.removeButton} onPress={onRemoveShift}>
              <Text style={styles.removeButtonText}>Rimuovi turno da questo giorno</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>Chiudi</Text>
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
  title: { color: theme.colors.text, fontSize: 18, fontWeight: "700", marginBottom: theme.spacing.md, textTransform: "capitalize" },
  list: { marginBottom: theme.spacing.sm },
  emptyText: { color: theme.colors.textMuted, marginBottom: theme.spacing.md },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
    borderRadius: theme.radius.sm,
    marginBottom: theme.spacing.xs,
  },
  optionSelected: { backgroundColor: theme.colors.surfaceAlt },
  dot: { width: 14, height: 14, borderRadius: 7 },
  optionText: { color: theme.colors.text, fontSize: 15 },
  secondaryButton: { paddingVertical: theme.spacing.sm, alignItems: "center" },
  secondaryButtonText: { color: theme.colors.primary, fontWeight: "600" },
  removeButton: { paddingVertical: theme.spacing.sm, alignItems: "center" },
  removeButtonText: { color: theme.colors.danger, fontWeight: "600" },
  closeButton: {
    marginTop: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.sm,
    alignItems: "center",
  },
  closeButtonText: { color: theme.colors.text, fontWeight: "600" },
});
