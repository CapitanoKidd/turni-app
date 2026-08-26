import DateTimePicker from "@react-native-community/datetimepicker";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { generateId } from "../lib/id";
import { storage } from "../lib/storage";
import { dateToTimeString, timeStringToDate } from "../lib/time";
import { nextShiftColor, theme } from "../lib/theme";
import type { ShiftType } from "../lib/types";

type ActivePicker = "start" | "end" | "alarm" | null;

export default function ShiftTypeEditorScreen() {
  const params = useLocalSearchParams<{ id?: string; prefillLabel?: string }>();

  const [allShiftTypes, setAllShiftTypes] = useState<ShiftType[]>([]);
  const [label, setLabel] = useState(params.prefillLabel ?? "");
  const [startTime, setStartTime] = useState("06:00");
  const [endTime, setEndTime] = useState("14:00");
  const [alarmEnabled, setAlarmEnabled] = useState(false);
  const [alarmTime, setAlarmTime] = useState("05:15");
  const [activePicker, setActivePicker] = useState<ActivePicker>(null);
  const [globalAlarmEnabled, setGlobalAlarmEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const isEditing = Boolean(params.id);

  useEffect(() => {
    (async () => {
      const [shiftTypes, settings] = await Promise.all([storage.getShiftTypes(), storage.getSettings()]);
      setAllShiftTypes(shiftTypes);
      setGlobalAlarmEnabled(settings.autoAlarmEnabled);

      if (params.id) {
        const existing = shiftTypes.find((s) => s.id === params.id);
        if (existing) {
          setLabel(existing.label);
          setStartTime(existing.startTime);
          setEndTime(existing.endTime);
          setAlarmEnabled(existing.alarmEnabled);
          setAlarmTime(existing.alarmTime ?? "05:15");
        }
      }
      setLoaded(true);
    })();
  }, [params.id]);

  async function handleSave() {
    const trimmedLabel = label.trim();
    if (!trimmedLabel) {
      Alert.alert("Manca il nome", "Scrivi come si chiama questo turno (es. M, Mattina, 1).");
      return;
    }
    if (alarmEnabled && !alarmTime) {
      Alert.alert("Manca l'orario sveglia", "Imposta a che ora deve suonare la sveglia per questo turno.");
      return;
    }

    const existingIndex = allShiftTypes.findIndex((s) => s.id === params.id);
    const shiftType: ShiftType = {
      id: params.id ?? generateId(),
      label: trimmedLabel,
      startTime,
      endTime,
      color: existingIndex >= 0 ? allShiftTypes[existingIndex].color : nextShiftColor(allShiftTypes.length),
      alarmEnabled,
      alarmTime: alarmEnabled ? alarmTime : undefined,
    };

    const next =
      existingIndex >= 0
        ? allShiftTypes.map((s, i) => (i === existingIndex ? shiftType : s))
        : [...allShiftTypes, shiftType];

    await storage.saveShiftTypes(next);
    router.back();
  }

  async function handleDelete() {
    if (!params.id) return;
    Alert.alert("Eliminare questo turno?", "Verra' rimosso anche dai giorni del calendario a cui e' assegnato.", [
      { text: "Annulla", style: "cancel" },
      {
        text: "Elimina",
        style: "destructive",
        onPress: async () => {
          const next = allShiftTypes.filter((s) => s.id !== params.id);
          await storage.saveShiftTypes(next);
          const entries = await storage.getCalendarEntries();
          const cleaned = Object.fromEntries(Object.entries(entries).filter(([, id]) => id !== params.id));
          await storage.saveCalendarEntries(cleaned);
          router.back();
        },
      },
    ]);
  }

  if (!loaded) return null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.fieldLabel}>Nome del turno</Text>
      <TextInput
        style={styles.input}
        value={label}
        onChangeText={setLabel}
        placeholder="Es. M, Mattina, 1, M1…"
        placeholderTextColor={theme.colors.textMuted}
      />

      <TimeRow label="Inizio" value={startTime} onPress={() => setActivePicker("start")} />
      <TimeRow label="Fine" value={endTime} onPress={() => setActivePicker("end")} />

      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.fieldLabel}>Sveglia per questo turno</Text>
          {!globalAlarmEnabled ? (
            <Text style={styles.hint}>La sveglia automatica e' disattivata nelle Impostazioni.</Text>
          ) : null}
        </View>
        <Switch value={alarmEnabled} onValueChange={setAlarmEnabled} />
      </View>

      {alarmEnabled ? <TimeRow label="Orario sveglia" value={alarmTime} onPress={() => setActivePicker("alarm")} /> : null}

      {activePicker ? (
        <DateTimePicker
          value={timeStringToDate(
            activePicker === "start" ? startTime : activePicker === "end" ? endTime : alarmTime,
          )}
          mode="time"
          is24Hour
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(_event, date) => {
            if (Platform.OS === "android") setActivePicker(null);
            if (!date) return;
            const value = dateToTimeString(date);
            if (activePicker === "start") setStartTime(value);
            else if (activePicker === "end") setEndTime(value);
            else setAlarmTime(value);
          }}
        />
      ) : null}

      <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
        <Text style={styles.saveButtonText}>Salva turno</Text>
      </TouchableOpacity>

      {isEditing ? (
        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
          <Text style={styles.deleteButtonText}>Elimina turno</Text>
        </TouchableOpacity>
      ) : null}
    </ScrollView>
  );
}

function TimeRow({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TouchableOpacity style={styles.timeButton} onPress={onPress}>
        <Text style={styles.timeButtonText}>{value}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, gap: theme.spacing.md },
  fieldLabel: { color: theme.colors.textMuted, fontSize: 13, marginBottom: theme.spacing.xs, fontWeight: "600" },
  hint: { color: theme.colors.textMuted, fontSize: 12 },
  input: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    color: theme.colors.text,
    fontSize: 16,
  },
  timeButton: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  timeButtonText: { color: theme.colors.text, fontSize: 16, fontWeight: "600" },
  switchRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
  saveButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
    alignItems: "center",
    marginTop: theme.spacing.md,
  },
  saveButtonText: { color: theme.colors.primaryText, fontWeight: "700", fontSize: 16 },
  deleteButton: { alignItems: "center", paddingVertical: theme.spacing.sm },
  deleteButtonText: { color: theme.colors.danger, fontWeight: "600" },
});
