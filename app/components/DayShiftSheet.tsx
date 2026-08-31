import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { dateToTimeString, timeStringToDate } from "../lib/time";
import { theme } from "../lib/theme";
import { isDayOff, type DayShiftOverride, type ShiftType } from "../lib/types";

interface DayShiftSheetProps {
  visible: boolean;
  dateIso: string | null;
  shiftTypes: ShiftType[];
  currentShiftTypeId?: string;
  /** Orario personalizzato gia' impostato per questo giorno, se presente. */
  override?: DayShiftOverride;
  onClose: () => void;
  onSelectShiftType: (shiftTypeId: string) => void;
  onRemoveShift: () => void;
  onSaveOverride: (override: DayShiftOverride) => void;
  onClearOverride: () => void;
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
  override,
  onClose,
  onSelectShiftType,
  onRemoveShift,
  onSaveOverride,
  onClearOverride,
  onCreateShiftType,
}: DayShiftSheetProps) {
  const currentShiftType = shiftTypes.find((s) => s.id === currentShiftTypeId);
  const canOverride = Boolean(currentShiftType) && !isDayOff(currentShiftType!);

  const [editingOverride, setEditingOverride] = useState(false);
  const [activePicker, setActivePicker] = useState<"start" | "end" | null>(null);
  const [draftStart, setDraftStart] = useState("");
  const [draftEnd, setDraftEnd] = useState("");

  // Ogni volta che si apre il foglio (o cambia il giorno) si riparte da zero:
  // niente editor di orario aperto residuo da un giorno precedente.
  useEffect(() => {
    if (!visible) return;
    setEditingOverride(false);
    setActivePicker(null);
    setDraftStart(override?.startTime ?? currentShiftType?.startTime ?? "06:00");
    setDraftEnd(override?.endTime ?? currentShiftType?.endTime ?? "14:00");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, dateIso]);

  if (!dateIso) return null;

  function handleSaveOverride() {
    onSaveOverride({ startTime: draftStart, endTime: draftEnd });
    setEditingOverride(false);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
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
                  activeOpacity={0.75}
                >
                  <View style={[styles.dot, { backgroundColor: shift.color }]} />
                  <Text style={styles.optionText}>
                    {isDayOff(shift) ? shift.label : `${shift.label} · ${shift.startTime}-${shift.endTime}`}
                  </Text>
                  {currentShiftTypeId === shift.id ? (
                    <Ionicons name="checkmark-circle" size={18} color={theme.colors.primary} />
                  ) : null}
                </TouchableOpacity>
              ))
            )}
          </ScrollView>

          {canOverride ? (
            <View style={styles.overrideBox}>
              {!editingOverride ? (
                <View style={styles.overrideRow}>
                  <Text style={styles.overrideText}>
                    {override
                      ? `Orario di oggi: ${override.startTime}-${override.endTime} (personalizzato)`
                      : `Orario standard: ${currentShiftType!.startTime}-${currentShiftType!.endTime}`}
                  </Text>
                  <TouchableOpacity onPress={() => setEditingOverride(true)}>
                    <Text style={styles.overrideLink}>Modifica orario di oggi</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <Text style={styles.overrideHint}>
                    Solo per questo giorno: es. esci un'ora prima o entri un'ora dopo. Il tipo di turno resta{" "}
                    {currentShiftType!.label}.
                  </Text>
                  <View style={styles.timeRow}>
                    <TouchableOpacity style={styles.timeButton} onPress={() => setActivePicker("start")}>
                      <Text style={styles.timeButtonLabel}>Inizio</Text>
                      <Text style={styles.timeButtonValue}>{draftStart}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.timeButton} onPress={() => setActivePicker("end")}>
                      <Text style={styles.timeButtonLabel}>Fine</Text>
                      <Text style={styles.timeButtonValue}>{draftEnd}</Text>
                    </TouchableOpacity>
                  </View>

                  {activePicker ? (
                    <DateTimePicker
                      value={timeStringToDate(activePicker === "start" ? draftStart : draftEnd)}
                      mode="time"
                      is24Hour
                      display={Platform.OS === "ios" ? "spinner" : "default"}
                      onChange={(_event, date) => {
                        if (Platform.OS === "android") setActivePicker(null);
                        if (!date) return;
                        const value = dateToTimeString(date);
                        if (activePicker === "start") setDraftStart(value);
                        else setDraftEnd(value);
                      }}
                    />
                  ) : null}

                  <TouchableOpacity style={styles.overrideSaveButton} onPress={handleSaveOverride}>
                    <Text style={styles.overrideSaveButtonText}>Salva orario personalizzato</Text>
                  </TouchableOpacity>
                  {override ? (
                    <TouchableOpacity
                      onPress={() => {
                        onClearOverride();
                        setEditingOverride(false);
                      }}
                    >
                      <Text style={styles.overrideResetText}>Ripristina orario standard</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity onPress={() => setEditingOverride(false)}>
                      <Text style={styles.overrideResetText}>Annulla</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>
          ) : null}

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
  backdrop: { flex: 1, backgroundColor: "rgba(4,8,16,0.72)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: theme.colors.surfaceElevated,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
    maxHeight: "85%",
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
  title: { ...theme.typography.heading, color: theme.colors.text, marginBottom: theme.spacing.md, textTransform: "capitalize" },
  list: { marginBottom: theme.spacing.sm },
  emptyText: { color: theme.colors.textMuted, marginBottom: theme.spacing.md },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
    borderRadius: theme.radius.sm,
    marginBottom: theme.spacing.xs,
    borderWidth: 1,
    borderColor: "transparent",
  },
  optionSelected: { backgroundColor: theme.colors.primaryMuted, borderColor: theme.colors.primary },
  dot: { width: 14, height: 14, borderRadius: 7 },
  optionText: { color: theme.colors.text, fontSize: 15, flex: 1 },
  overrideBox: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.sm,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    gap: theme.spacing.xs,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  overrideRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: theme.spacing.sm },
  overrideText: { color: theme.colors.text, fontSize: 13, flex: 1 },
  overrideLink: { color: theme.colors.primary, fontWeight: "600", fontSize: 13 },
  overrideHint: { color: theme.colors.textMuted, fontSize: 12, lineHeight: 17 },
  timeRow: { flexDirection: "row", gap: theme.spacing.sm },
  timeButton: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.sm,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  timeButtonLabel: { color: theme.colors.textFaint, fontSize: 11, fontWeight: "600" },
  timeButtonValue: { color: theme.colors.text, fontSize: 15, fontWeight: "700" },
  overrideSaveButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.sm,
    paddingVertical: theme.spacing.sm,
    alignItems: "center",
  },
  overrideSaveButtonText: { color: theme.colors.primaryText, fontWeight: "700" },
  overrideResetText: { color: theme.colors.danger, fontSize: 12, fontWeight: "600", textAlign: "center" },
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
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  closeButtonText: { color: theme.colors.text, fontWeight: "600" },
});
