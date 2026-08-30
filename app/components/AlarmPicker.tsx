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
        <Switch value={enabled} onValueChange={onToggleEnabled} />
      </View>

      {enabled ? (
        <View>
          <Text style={styles.fieldLabel}>Orario sveglia</Text>
          <TouchableOpacity style={styles.timeButton} onPress={() => setPickerOpen(true)}>
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
  fieldLabel: { color: theme.colors.textMuted, fontSize: 13, marginBottom: theme.spacing.xs, fontWeight: "600" },
  timeButton: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  timeButtonText: { color: theme.colors.text, fontSize: 16, fontWeight: "600" },
});
