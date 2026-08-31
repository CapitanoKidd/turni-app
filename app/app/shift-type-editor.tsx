import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { AlarmPicker } from "../components/AlarmPicker";
import { generateId } from "../lib/id";
import { rescheduleAlarmsForShiftType } from "../lib/notifications";
import { storage } from "../lib/storage";
import { dateToTimeString, timeStringToDate } from "../lib/time";
import { nextShiftColor, SHIFT_COLOR_PALETTE, theme } from "../lib/theme";
import type { ShiftType } from "../lib/types";

type ActivePicker = "start" | "end" | null;

export default function ShiftTypeEditorScreen() {
  const params = useLocalSearchParams<{ id?: string; prefillLabel?: string }>();

  const [allShiftTypes, setAllShiftTypes] = useState<ShiftType[]>([]);
  const [label, setLabel] = useState(params.prefillLabel ?? "");
  const [isRestDay, setIsRestDay] = useState(false);
  const [isVacation, setIsVacation] = useState(false);
  const [startTime, setStartTime] = useState("06:00");
  const [endTime, setEndTime] = useState("14:00");
  const [alarmEnabled, setAlarmEnabled] = useState(false);
  const [alarmTime, setAlarmTime] = useState("05:15");
  const [color, setColor] = useState<string | null>(SHIFT_COLOR_PALETTE[0]);
  // true appena l'utente tocca un colore di persona (incluso "nessun
  // colore"): da quel momento il colore non viene piu' toccato in automatico
  // dal cambio di Riposo/Ferie sotto, e' scelta sua.
  const [colorTouched, setColorTouched] = useState(false);
  const [activePicker, setActivePicker] = useState<ActivePicker>(null);
  const [loaded, setLoaded] = useState(false);

  const isEditing = Boolean(params.id);

  useEffect(() => {
    (async () => {
      const shiftTypes = await storage.getShiftTypes();
      setAllShiftTypes(shiftTypes);
      setColor(nextShiftColor(shiftTypes.length)); // ripiego per un turno nuovo, sovrascritto sotto se si sta modificando uno esistente

      if (params.id) {
        const existing = shiftTypes.find((s) => s.id === params.id);
        if (existing) {
          setLabel(existing.label);
          setIsRestDay(existing.isRestDay);
          setIsVacation(existing.isVacation);
          setStartTime(existing.startTime ?? "06:00");
          setEndTime(existing.endTime ?? "14:00");
          setAlarmEnabled(existing.alarmEnabled);
          setAlarmTime(existing.alarmTime ?? "05:15");
          setColor(existing.color);
          setColorTouched(true); // un turno esistente ha gia' un colore scelto (o esplicitamente "nessuno"): non va risovrascritto
        }
      }
      setLoaded(true);
    })();
  }, [params.id]);

  // Un turno di riposo/ferie di un turno NUOVO parte di default senza
  // colore; un turno di lavoro riprende il colore automatico. Solo finche'
  // l'utente non sceglie un colore di persona (colorTouched) — dopo, questa
  // reazione automatica si disattiva: la sua scelta resta quella che ha
  // fatto, anche se in seguito riattiva/disattiva Riposo o Ferie.
  useEffect(() => {
    if (isEditing || colorTouched) return;
    setColor(isRestDay || isVacation ? null : nextShiftColor(allShiftTypes.length));
  }, [isRestDay, isVacation, isEditing, colorTouched, allShiftTypes.length]);

  function selectColor(value: string | null) {
    setColor(value);
    setColorTouched(true);
  }

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
    const dayOff = isRestDay || isVacation;
    const shiftType: ShiftType = {
      id: params.id ?? generateId(),
      label: trimmedLabel,
      isRestDay,
      isVacation,
      startTime: dayOff ? undefined : startTime,
      endTime: dayOff ? undefined : endTime,
      color,
      alarmEnabled: dayOff ? false : alarmEnabled,
      alarmTime: !dayOff && alarmEnabled ? alarmTime : undefined,
    };

    const next =
      existingIndex >= 0
        ? allShiftTypes.map((s, i) => (i === existingIndex ? shiftType : s))
        : [...allShiftTypes, shiftType];

    await storage.saveShiftTypes(next);
    // L'orario/attivazione sveglia puo' essere cambiato per un turno gia'
    // assegnato a giorni del calendario: senza questo, le notifiche gia'
    // programmate resterebbero con l'orario vecchio.
    if (existingIndex >= 0) {
      await rescheduleAlarmsForShiftType(shiftType.id, next);
    }
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
      <View style={styles.card}>
        <Text style={styles.fieldLabel}>Nome del turno</Text>
        <TextInput
          style={styles.input}
          value={label}
          onChangeText={setLabel}
          placeholder="Es. M, Mattina, 1, M1…"
          placeholderTextColor={theme.colors.textFaint}
        />

        <Text style={[styles.fieldLabel, { marginTop: theme.spacing.xs }]}>Colore</Text>
        <Text style={styles.hint}>
          I turni di riposo/ferie di norma restano senza colore: assegnane uno solo se vuoi vederlo comunque nel calendario.
        </Text>
        <View style={styles.colorRow}>
          <TouchableOpacity
            style={[styles.colorSwatch, styles.noColorSwatch, color === null && styles.colorSwatchSelected]}
            onPress={() => selectColor(null)}
            activeOpacity={0.8}
          >
            <Ionicons name="ban-outline" size={16} color={theme.colors.textFaint} />
          </TouchableOpacity>
          {SHIFT_COLOR_PALETTE.map((paletteColor) => (
            <TouchableOpacity
              key={paletteColor}
              style={[
                styles.colorSwatch,
                { backgroundColor: paletteColor },
                color === paletteColor && styles.colorSwatchSelected,
              ]}
              onPress={() => selectColor(paletteColor)}
              activeOpacity={0.8}
            >
              {color === paletteColor ? <Ionicons name="checkmark" size={16} color={theme.colors.background} /> : null}
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Riposo</Text>
            <Text style={styles.hint}>Nessun orario di lavoro e nessuna sveglia per questo turno.</Text>
          </View>
          <Switch
            value={isRestDay}
            onValueChange={(value) => {
              setIsRestDay(value);
              if (value) setIsVacation(false);
            }}
            trackColor={{ false: theme.colors.border, true: theme.colors.primaryMuted }}
            thumbColor={isRestDay ? theme.colors.primary : theme.colors.textFaint}
          />
        </View>

        <View style={styles.divider} />

        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Ferie</Text>
            <Text style={styles.hint}>Come riposo, ma contata separatamente nel riepilogo del mese.</Text>
          </View>
          <Switch
            value={isVacation}
            onValueChange={(value) => {
              setIsVacation(value);
              if (value) setIsRestDay(false);
            }}
            trackColor={{ false: theme.colors.border, true: theme.colors.primaryMuted }}
            thumbColor={isVacation ? theme.colors.primary : theme.colors.textFaint}
          />
        </View>
      </View>

      {!isRestDay && !isVacation ? (
        <View style={styles.card}>
          <View style={styles.timeRow}>
            <TimeRow label="Inizio" value={startTime} onPress={() => setActivePicker("start")} />
            <TimeRow label="Fine" value={endTime} onPress={() => setActivePicker("end")} />
          </View>

          <View style={styles.divider} />

          <AlarmPicker enabled={alarmEnabled} time={alarmTime} onToggleEnabled={setAlarmEnabled} onChangeTime={setAlarmTime} />
        </View>
      ) : null}

      {activePicker ? (
        <DateTimePicker
          value={timeStringToDate(activePicker === "start" ? startTime : endTime)}
          mode="time"
          is24Hour
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(_event, date) => {
            if (Platform.OS === "android") setActivePicker(null);
            if (!date) return;
            const value = dateToTimeString(date);
            if (activePicker === "start") setStartTime(value);
            else setEndTime(value);
          }}
        />
      ) : null}

      <TouchableOpacity style={styles.saveButton} onPress={handleSave} activeOpacity={0.85}>
        <Text style={styles.saveButtonText}>Salva turno</Text>
      </TouchableOpacity>

      {isEditing ? (
        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete} activeOpacity={0.8}>
          <Ionicons name="trash-outline" size={16} color={theme.colors.danger} />
          <Text style={styles.deleteButtonText}>Elimina turno</Text>
        </TouchableOpacity>
      ) : null}
    </ScrollView>
  );
}

function TimeRow({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TouchableOpacity style={styles.timeButton} onPress={onPress} activeOpacity={0.8}>
        <Text style={styles.timeButtonText}>{value}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xl, gap: theme.spacing.md },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadow.card,
  },
  divider: { height: 1, backgroundColor: theme.colors.border },
  fieldLabel: { ...theme.typography.label, color: theme.colors.textFaint },
  hint: { color: theme.colors.textMuted, fontSize: 12, marginTop: 2, lineHeight: 16 },
  input: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    color: theme.colors.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  timeRow: { flexDirection: "row", gap: theme.spacing.sm },
  timeButton: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
  },
  timeButtonText: { color: theme.colors.primary, fontSize: 18, fontFamily: theme.font.extraBold, letterSpacing: 0.5 },
  colorRow: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
  colorSwatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  colorSwatchSelected: { borderColor: theme.colors.text },
  noColorSwatch: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
  },
  switchRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
  saveButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
    alignItems: "center",
    marginTop: theme.spacing.sm,
    ...theme.shadow.card,
    shadowColor: theme.colors.primary,
  },
  saveButtonText: { color: theme.colors.primaryText, fontFamily: theme.font.bold, fontSize: 16 },
  deleteButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: theme.spacing.sm },
  deleteButtonText: { color: theme.colors.danger, fontFamily: theme.font.semiBold },
});
