import DateTimePicker from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Platform, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { dateToTimeString, timeStringToDate } from "../lib/time";
import { theme } from "../lib/theme";

interface AlarmPickerProps {
  enabled: boolean;
  time: string;
  onToggleEnabled: (value: boolean) => void;
  onChangeTime: (time: string) => void;
  label?: string;
}

/**
 * Switch "sveglia attiva" + selettore orario, condiviso fra l'editor del
 * tipo di turno e il modale rapido "icona sveglia" in Impostazioni: stesso
 * controllo, due punti d'ingresso diversi.
 */
export function AlarmPicker({ enabled, time, onToggleEnabled, onChangeTime, label = "Sveglia per questo turno" }: AlarmPickerProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <View style={styles.container}>
      <View style={styles.switchRow}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Switch
          value={enabled}
          onValueChange={onToggleEnabled}
          trackColor={{ false: theme.colors.border, true: theme.colors.primaryMuted }}
          thumbColor={enabled ? theme.colors.primary : theme.colors.textFaint}
        />
      </View>

      {enabled ? (
        <View>
          <Text style={styles.fieldLabel}>Orario sveglia</Text>
          <TouchableOpacity style={styles.timeButton} onPress={() => setPickerOpen(true)} activeOpacity={0.8}>
            <Text style={styles.timeButtonText}>{time}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {enabled && pickerOpen ? (
        <DateTimePicker
          value={timeStringToDate(time)}
          mode="time"
          is24Hour
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(_event, date) => {
            if (Platform.OS === "android") setPickerOpen(false);
            if (!date) return;
            onChangeTime(dateToTimeString(date));
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: theme.spacing.sm },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: theme.spacing.sm },
  fieldLabel: { ...theme.typography.label, color: theme.colors.textFaint, marginBottom: theme.spacing.xs },
  timeButton: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
  },
  timeButtonText: { color: theme.colors.primary, fontSize: 18, fontFamily: theme.font.extraBold, letterSpacing: 0.5 },
});
