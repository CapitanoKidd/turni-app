import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { theme } from "../lib/theme";
import type { CalendarEntries, ShiftType } from "../lib/types";

const WEEKDAY_LABELS = ["L", "M", "M", "G", "V", "S", "D"];

interface MonthCalendarProps {
  year: number;
  month1To12: number;
  entries: CalendarEntries;
  shiftTypes: ShiftType[];
  onDayPress: (dateIso: string) => void;
}

function toIso(year: number, month1To12: number, day: number): string {
  const mm = String(month1To12).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/** Lunedi'=0 ... Domenica=6, per allineare la griglia con WEEKDAY_LABELS. */
function mondayIndex(jsWeekday: number): number {
  return (jsWeekday + 6) % 7;
}

export function MonthCalendar({ year, month1To12, entries, shiftTypes, onDayPress }: MonthCalendarProps) {
  const shiftTypeById = new Map(shiftTypes.map((s) => [s.id, s]));
  const totalDays = new Date(year, month1To12, 0).getDate();
  const firstWeekday = mondayIndex(new Date(year, month1To12 - 1, 1).getDay());

  const todayIso = toIso(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());

  const cells: Array<{ day: number; iso: string } | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: totalDays }, (_, i) => ({ day: i + 1, iso: toIso(year, month1To12, i + 1) })),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <View>
      <View style={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((label, i) => (
          <Text key={i} style={styles.weekdayLabel}>
            {label}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((cell, index) => {
          if (!cell) return <View key={index} style={styles.cell} />;

          const shiftType = entries[cell.iso] ? shiftTypeById.get(entries[cell.iso]) : undefined;
          const isToday = cell.iso === todayIso;

          return (
            <TouchableOpacity
              key={index}
              style={[
                styles.cell,
                styles.dayCell,
                shiftType ? { backgroundColor: shiftType.color } : styles.emptyDayCell,
                isToday && styles.todayBorder,
              ]}
              onPress={() => onDayPress(cell.iso)}
              activeOpacity={0.7}
            >
              <Text style={[styles.dayNumber, shiftType && styles.dayNumberOnShift]}>{cell.day}</Text>
              {shiftType ? (
                <Text numberOfLines={1} style={styles.shiftLabel}>
                  {shiftType.label}
                </Text>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const CELL_SIZE = "13.8%";

const styles = StyleSheet.create({
  weekdayRow: { flexDirection: "row", marginBottom: theme.spacing.xs },
  weekdayLabel: {
    width: CELL_SIZE,
    textAlign: "center",
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: CELL_SIZE, aspectRatio: 1, margin: "0.35%" },
  dayCell: {
    borderRadius: theme.radius.sm,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  emptyDayCell: { backgroundColor: theme.colors.surface },
  todayBorder: { borderWidth: 2, borderColor: theme.colors.primary },
  dayNumber: { color: theme.colors.text, fontSize: 13, fontWeight: "600" },
  dayNumberOnShift: { color: "#0B1220" },
  shiftLabel: { color: "#0B1220", fontSize: 10, fontWeight: "700", maxWidth: "90%" },
});
