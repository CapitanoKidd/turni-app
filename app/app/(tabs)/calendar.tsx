import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { DayShiftSheet } from "../../components/DayShiftSheet";
import { MonthCalendar } from "../../components/MonthCalendar";
import { MonthSummary } from "../../components/MonthSummary";
import { cancelAlarmsForDates, ensureNotificationPermission, scheduleAlarmsForEntries } from "../../lib/notifications";
import { storage } from "../../lib/storage";
import { theme } from "../../lib/theme";
import { TutorialDim, TutorialTarget } from "../../lib/tutorial";
import type { CalendarEntries, CalendarOverrides, DayShiftOverride, ShiftType } from "../../lib/types";

const MONTH_NAMES = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

export default function CalendarScreen() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [entries, setEntries] = useState<CalendarEntries>({});
  const [overrides, setOverrides] = useState<CalendarOverrides>({});
  const [shiftTypes, setShiftTypes] = useState<ShiftType[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const reload = useCallback(() => {
    Promise.all([storage.getCalendarEntries(), storage.getCalendarOverrides(), storage.getShiftTypes()]).then(
      ([e, o, s]) => {
        setEntries(e);
        setOverrides(o);
        setShiftTypes(s);
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

    // Un orario personalizzato ha senso solo per il turno per cui e' stato
    // impostato: cambiare o rimuovere il turno del giorno lo rende privo di
    // significato, quindi va tolto.
    if (overrides[selectedDate]) {
      const { [selectedDate]: _removed, ...restOverrides } = overrides;
      setOverrides(restOverrides);
      await storage.saveCalendarOverrides(restOverrides);
    }

    // Se questo giorno era rimasto "in sospeso" (conosciamo il disegno della
    // cella ma non il suo significato), l'assegnazione manuale dell'utente e'
    // proprio la risposta che mancava: la impariamo, cosi' il mese prossimo
    // quel simbolo viene riconosciuto da solo.
    if (shiftTypeId) {
      const pending = await storage.getPendingCells();
      const fingerprint = pending[selectedDate];
      const label = shiftTypes.find((s) => s.id === shiftTypeId)?.label.trim();
      if (fingerprint && label) {
        await storage.mergeCellCodeMemory({ [fingerprint]: label.toUpperCase() });
        const { [selectedDate]: _learned, ...rest } = pending;
        await storage.savePendingCells(rest);
      }
    }

    // La sveglia e' un attributo del tipo di turno: se il turno scelto ne
    // prevede una, si programma sempre, senza bisogno di un interruttore
    // globale.
    if (shiftTypeId) {
      const shiftType = shiftTypes.find((s) => s.id === shiftTypeId);
      if (shiftType?.alarmEnabled) {
        const granted = await ensureNotificationPermission();
        if (granted) await scheduleAlarmsForEntries({ [selectedDate]: shiftTypeId }, shiftTypes);
      } else {
        await cancelAlarmsForDates([selectedDate]);
      }
    } else {
      await cancelAlarmsForDates([selectedDate]);
    }
    setSelectedDate(null);
  }

  async function applyOverride(override: DayShiftOverride | null) {
    if (!selectedDate) return;
    const next = { ...overrides };
    if (override) next[selectedDate] = override;
    else delete next[selectedDate];
    setOverrides(next);
    await storage.saveCalendarOverrides(next);
  }

  const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;
  const hasShifts = Object.keys(entries).some((date) => date.startsWith(monthPrefix));

  function handleResetCalendar() {
    const datesThisMonth = Object.keys(entries).filter((date) => date.startsWith(monthPrefix));
    if (datesThisMonth.length === 0) return;

    Alert.alert(
      "Cancellare i turni di questo mese?",
      `Verranno rimossi solo i turni di ${MONTH_NAMES[month - 1]} ${year} e le sveglie collegate. Gli altri mesi e i tipi di turno che hai creato restano.`,
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Cancella",
          style: "destructive",
          onPress: async () => {
            const next = { ...entries };
            for (const date of datesThisMonth) delete next[date];
            setEntries(next);
            await storage.saveCalendarEntries(next);

            const nextOverrides = { ...overrides };
            for (const date of datesThisMonth) delete nextOverrides[date];
            setOverrides(nextOverrides);
            await storage.saveCalendarOverrides(nextOverrides);

            await cancelAlarmsForDates(datesThisMonth);
          },
        },
      ],
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TutorialDim>
        <Text style={styles.pageTitle}>Calendario</Text>
      </TutorialDim>

      {/*
        Avvolge ENTRAMBI i rami (calendario pieno e stato vuoto): durante il
        tutorial guidato, alla prima apertura, di solito non esiste ancora
        nessun turno (lo si spiega solo, non si costringe a crearne uno),
        quindi e' il ramo "vuoto" quello che si evidenzia davvero in quel
        momento.
      */}
      <TutorialTarget name="calendar-overview" style={styles.calendarCard}>
        <View style={styles.monthPicker}>
          <TouchableOpacity onPress={() => shiftMonth(-1)} style={styles.monthArrow}>
            <Ionicons name="chevron-back" size={18} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={styles.monthLabel}>
            {MONTH_NAMES[month - 1]} {year}
          </Text>
          <TouchableOpacity onPress={() => shiftMonth(1)} style={styles.monthArrow}>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.text} />
          </TouchableOpacity>
        </View>

        {shiftTypes.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={32} color={theme.colors.textFaint} />
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
              overrides={overrides}
              shiftTypes={shiftTypes}
              onDayPress={setSelectedDate}
            />
            {!hasShifts ? <Text style={styles.noneThisMonth}>Nessun turno importato per questo mese.</Text> : null}
          </>
        )}
      </TutorialTarget>

      {shiftTypes.length > 0 ? (
        <TutorialDim style={{ gap: theme.spacing.md }}>
          <MonthSummary year={year} month1To12={month} entries={entries} shiftTypes={shiftTypes} />
          {hasShifts ? (
            <TouchableOpacity style={styles.resetButton} onPress={handleResetCalendar}>
              <Ionicons name="trash-outline" size={14} color={theme.colors.danger} />
              <Text style={styles.resetButtonText}>Cancella i turni di questo mese</Text>
            </TouchableOpacity>
          ) : null}
        </TutorialDim>
      ) : null}

      <DayShiftSheet
        visible={selectedDate !== null}
        dateIso={selectedDate}
        shiftTypes={shiftTypes}
        currentShiftTypeId={selectedDate ? entries[selectedDate] : undefined}
        override={selectedDate ? overrides[selectedDate] : undefined}
        onClose={() => setSelectedDate(null)}
        onSelectShiftType={(id) => applyDayChange(id)}
        onRemoveShift={() => applyDayChange(null)}
        onSaveOverride={applyOverride}
        onClearOverride={() => applyOverride(null)}
        onCreateShiftType={() => router.push("/shift-type-editor")}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xl, gap: theme.spacing.lg },
  pageTitle: { ...theme.typography.title, color: theme.colors.text },
  calendarCard: {
    backgroundColor: theme.colors.surfaceTint,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  monthPicker: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.xs,
  },
  monthArrow: {
    padding: theme.spacing.xs,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surface,
  },
  monthLabel: { color: theme.colors.text, fontSize: 17, fontFamily: theme.font.extraBold, textTransform: "capitalize", letterSpacing: -0.2 },
  noneThisMonth: { ...theme.typography.caption, color: theme.colors.textFaint, textAlign: "center" },
  emptyState: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.xl,
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  emptyTitle: { color: theme.colors.text, fontSize: 17, fontFamily: theme.font.bold },
  emptyText: { color: theme.colors.textMuted, textAlign: "center" },
  emptyButton: {
    marginTop: theme.spacing.sm,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  emptyButtonText: { color: theme.colors.primaryText, fontFamily: theme.font.bold },
  resetButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: theme.spacing.sm,
  },
  resetButtonText: { color: theme.colors.danger, fontSize: 13, fontFamily: theme.font.semiBold },
});
