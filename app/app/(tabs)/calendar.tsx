import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { DayShiftSheet } from "../../components/DayShiftSheet";
import { MonthCalendar } from "../../components/MonthCalendar";
import { MonthSummary } from "../../components/MonthSummary";
import { ShiftLegend } from "../../components/ShiftLegend";
import { cancelAlarmsForDates, cancelAllAlarms, scheduleAlarmsForEntries } from "../../lib/notifications";
import { storage } from "../../lib/storage";
import { theme } from "../../lib/theme";
import type { AppSettings, CalendarEntries, ShiftType } from "../../lib/types";

const MONTH_NAMES = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

export default function CalendarScreen() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [entries, setEntries] = useState<CalendarEntries>({});
  const [shiftTypes, setShiftTypes] = useState<ShiftType[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const reload = useCallback(() => {
    Promise.all([storage.getCalendarEntries(), storage.getShiftTypes(), storage.getSettings()]).then(
      ([e, s, cfg]) => {
        setEntries(e);
        setShiftTypes(s);
        setSettings(cfg);
      },
    );
  }, []);

  useFocusEffect(reload);

  function shiftMonth(delta: number) {
    let newMonth = month + delta;
    let newYear = year;
    if (newMonth < 1) { newMonth = 12; newYear -= 1; }
    if (newMonth > 12) { newMonth = 1; newYear += 1; }
    setMonth(newMonth);
    setYear(newYear);
  }

  async function applyDayChange(shiftTypeId: string | null) {
    if (!selectedDate) return;
    const next = { ...entries };
    if (shiftTypeId) next[selectedDate] = shiftTypeId;
    else delete next[selectedDate];
    setEntries(next);
    await storage.saveCalendarEntries(next);

    if (settings?.autoAlarmEnabled) {
      if (shiftTypeId) {
        await scheduleAlarmsForEntries({ [selectedDate]: shiftTypeId }, shiftTypes);
      } else {
        await cancelAlarmsForDates([selectedDate]);
      }
    }
    setSelectedDate(null);
  }

  const hasShifts = Object.keys(entries).some((date) => date.startsWith(`${year}-${String(month).padStart(2, "0")}`));
  const hasAnyEntries = Object.keys(entries).length > 0;

  function handleResetCalendar() {
    Alert.alert(
      "Cancellare tutti i turni?",
      "Verranno rimossi i turni di TUTTI i mesi (non solo quello attuale) e le sveglie collegate. I tipi di turno che hai creato restano, potrai riassegnarli caricando di nuovo la griglia.",
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Cancella tutto",
          style: "destructive",
          onPress: async () => {
            await storage.saveCalendarEntries({});
            await cancelAllAlarms();
            setEntries({});
          },
        },
      ],
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.monthPicker}>
        <TouchableOpacity onPress={() => shiftMonth(-1)} style={styles.monthArrow}>
          <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.monthLabel}>
          {MONTH_NAMES[month - 1]} {year}
        </Text>
        <TouchableOpacity onPress={() => shiftMonth(1)} style={styles.monthArrow}>
          <Ionicons name="chevron-forward" size={22} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      {shiftTypes.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Nessun turno ancora</Text>
          <Text style={styles.emptyText}>Vai nella Home e carica la griglia turni per iniziare.</Text>
          <TouchableOpacity style={styles.emptyButton} onPress={() => router.push("/(tabs)")}>
            <Text style={styles.emptyButtonText}>Vai alla Home</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <MonthCalendar
            year={year}
            month1To12={month}
            entries={entries}
            shiftTypes={shiftTypes}
            onDayPress={setSelectedDate}
          />
          {!hasShifts ? <Text style={styles.noneThisMonth}>Nessun turno importato per questo mese.</Text> : null}
          <MonthSummary year={year} month1To12={month} entries={entries} shiftTypes={shiftTypes} />
          {settings?.legendVisible ? <ShiftLegend shiftTypes={shiftTypes} /> : null}
          {hasAnyEntries ? (
            <TouchableOpacity style={styles.resetButton} onPress={handleResetCalendar}>
              <Text style={styles.resetButtonText}>Cancella tutti i turni</Text>
            </TouchableOpacity>
          ) : null}
        </>
      )}

      <DayShiftSheet
        visible={selectedDate !== null}
        dateIso={selectedDate}
        shiftTypes={shiftTypes}
        currentShiftTypeId={selectedDate ? entries[selectedDate] : undefined}
        onClose={() => setSelectedDate(null)}
        onSelectShiftType={(id) => applyDayChange(id)}
        onRemoveShift={() => applyDayChange(null)}
        onCreateShiftType={() => router.push("/shift-type-editor")}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, gap: theme.spacing.md },
  monthPicker: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  monthArrow: { padding: theme.spacing.xs },
  monthLabel: { color: theme.colors.text, fontSize: 16, fontWeight: "700", textTransform: "capitalize" },
  noneThisMonth: { color: theme.colors.textMuted, fontSize: 13, textAlign: "center" },
  emptyState: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.xl,
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  emptyTitle: { color: theme.colors.text, fontSize: 17, fontWeight: "700" },
  emptyText: { color: theme.colors.textMuted, textAlign: "center" },
  emptyButton: {
    marginTop: theme.spacing.sm,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  emptyButtonText: { color: theme.colors.primaryText, fontWeight: "700" },
  resetButton: { alignItems: "center", paddingVertical: theme.spacing.sm },
  resetButtonText: { color: theme.colors.danger, fontSize: 13, fontWeight: "600" },
});
