import { useState } from "react";
import { LayoutChangeEvent, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { theme } from "../lib/theme";
import { isDayOff, type CalendarEntries, type CalendarOverrides, type ShiftType } from "../lib/types";

const WEEKDAY_LABELS = ["L", "M", "M", "G", "V", "S", "D"];
const COLUMNS = 7;
/** Spazio fisso fra le celle, in pixel: la larghezza di ogni cella si calcola sottraendo questi spazi dalla larghezza misurata del contenitore, cosi' 7 colonne ci stanno sempre per costruzione (mai un arrotondamento percentuale che ne fa entrare solo 6). */
const CELL_GAP = 4;

interface MonthCalendarProps {
  year: number;
  month1To12: number;
  entries: CalendarEntries;
  shiftTypes: ShiftType[];
  overrides?: CalendarOverrides;
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

export function MonthCalendar({ year, month1To12, entries, shiftTypes, overrides, onDayPress }: MonthCalendarProps) {
  const [containerWidth, setContainerWidth] = useState(0);

  const shiftTypeById = new Map(shiftTypes.map((s) => [s.id, s]));
  const totalDays = new Date(year, month1To12, 0).getDate();
  const firstWeekday = mondayIndex(new Date(year, month1To12 - 1, 1).getDay());

  const todayIso = toIso(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());

  const cells: Array<{ day: number; iso: string } | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: totalDays }, (_, i) => ({ day: i + 1, iso: toIso(year, month1To12, i + 1) })),
  ];
  while (cells.length % COLUMNS !== 0) cells.push(null);

  function handleLayout(e: LayoutChangeEvent) {
    setContainerWidth(e.nativeEvent.layout.width);
  }

  // Finche' non conosciamo la larghezza vera non disegniamo celle: prima
  // del primo onLayout avrebbero larghezza 0 e si vedrebbe un lampo vuoto.
  const cellSize = containerWidth > 0 ? (containerWidth - CELL_GAP * (COLUMNS - 1)) / COLUMNS : 0;

  return (
    <View onLayout={handleLayout}>
      <View style={[styles.weekdayRow, { gap: CELL_GAP }]}>
        {WEEKDAY_LABELS.map((label, i) => (
          <Text key={i} style={[styles.weekdayLabel, { width: cellSize }]}>
            {label}
          </Text>
        ))}
      </View>

      {cellSize > 0 ? (
        <View style={[styles.grid, { gap: CELL_GAP }]}>
          {cells.map((cell, index) => {
            if (!cell) return <View key={index} style={{ width: cellSize, height: cellSize }} />;

            const shiftType = entries[cell.iso] ? shiftTypeById.get(entries[cell.iso]) : undefined;
            const isToday = cell.iso === todayIso;
            const isWorkingShift = shiftType && !isDayOff(shiftType);
            const hasOverride = Boolean(overrides?.[cell.iso]);

            return (
              <TouchableOpacity
                key={index}
                style={[
                  styles.dayCell,
                  { width: cellSize, height: cellSize },
                  isWorkingShift ? { backgroundColor: shiftType.color } : styles.emptyDayCell,
                  shiftType && isDayOff(shiftType) && styles.restDayCell,
                  isToday && styles.todayBorder,
                ]}
                onPress={() => onDayPress(cell.iso)}
                activeOpacity={0.7}
              >
                <Text style={[styles.dayNumber, isToday && !isWorkingShift && styles.dayNumberToday, isWorkingShift && styles.dayNumberOnShift]}>{cell.day}</Text>
                {shiftType ? (
                  <Text
                    numberOfLines={1}
                    style={[styles.shiftLabel, !isWorkingShift && styles.shiftLabelMuted]}
                  >
                    {shiftType.label}
                  </Text>
                ) : null}
                {hasOverride ? <View style={styles.overrideDot} /> : null}
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  weekdayRow: { flexDirection: "row", marginBottom: theme.spacing.xs },
  weekdayLabel: {
    textAlign: "center",
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  dayCell: {
    borderRadius: theme.radius.sm,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  emptyDayCell: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },
  // Un giorno di riposo non ha il colore pieno di un turno: deve leggersi
  // subito come "non si lavora", non confondersi con un turno vero.
  restDayCell: { borderWidth: 1, borderColor: theme.colors.borderStrong, borderStyle: "dashed" },
  todayBorder: { borderWidth: 2, borderColor: theme.colors.primary },
  dayNumber: { color: theme.colors.text, fontSize: 13, fontWeight: "600" },
  dayNumberToday: { color: theme.colors.primary, fontWeight: "800" },
  dayNumberOnShift: { color: theme.colors.background },
  shiftLabel: { color: theme.colors.background, fontSize: 10, fontWeight: "700", maxWidth: "90%" },
  shiftLabelMuted: { color: theme.colors.textMuted },
  // Piccolo indicatore per i giorni con un orario personalizzato ("modifica singolo turno"), visibile a colpo d'occhio senza aprire il giorno.
  overrideDot: {
    position: "absolute",
    top: 3,
    right: 3,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: theme.colors.text,
    borderWidth: 1.5,
    borderColor: theme.colors.background,
  },
});
