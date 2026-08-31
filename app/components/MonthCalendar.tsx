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
  // La LARGHEZZA resta legata a "7 colonne esatte" (non si tocca: e' il
  // calcolo che risolve il bug storico di allineamento). L'ALTEZZA invece
  // e' volutamente maggiore della larghezza (celle rettangolari, non
  // quadrate): piu' spazio per numero e sigla del turno, senza cambiare a
  // quale colonna/giorno corrisponde ciascuna cella.
  const cellWidth = containerWidth > 0 ? (containerWidth - CELL_GAP * (COLUMNS - 1)) / COLUMNS : 0;
  const cellHeight = cellWidth * 1.3;

  return (
    <View onLayout={handleLayout}>
      <View style={[styles.weekdayRow, { gap: CELL_GAP }]}>
        {WEEKDAY_LABELS.map((label, i) => (
          <Text key={i} style={[styles.weekdayLabel, { width: cellWidth }]}>
            {label}
          </Text>
        ))}
      </View>

      {cellWidth > 0 ? (
        <View style={[styles.grid, { gap: CELL_GAP }]}>
          {cells.map((cell, index) => {
            if (!cell) return <View key={index} style={{ width: cellWidth, height: cellHeight }} />;

            const shiftType = entries[cell.iso] ? shiftTypeById.get(entries[cell.iso]) : undefined;
            const isToday = cell.iso === todayIso;
            // Di norma un giorno di riposo/ferie resta senza colore (il suo
            // "color" e' null di default) - ma se l'utente gliene ha
            // assegnato uno lo stesso, va rispettato qui esattamente come
            // per un turno di lavoro: e' il colore stesso ad avere l'ultima
            // parola, non se il turno preveda un orario di lavoro o meno.
            const hasColor = Boolean(shiftType?.color);
            const hasOverride = Boolean(overrides?.[cell.iso]);

            return (
              <TouchableOpacity
                key={index}
                style={[
                  styles.dayCell,
                  { width: cellWidth, height: cellHeight },
                  hasColor ? { backgroundColor: shiftType!.color! } : styles.emptyDayCell,
                  shiftType && isDayOff(shiftType) && styles.restDayCell,
                  isToday && styles.todayBorder,
                ]}
                onPress={() => onDayPress(cell.iso)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.dayNumber,
                    isToday && !hasColor && styles.dayNumberToday,
                    hasColor && styles.dayNumberOnShift,
                  ]}
                >
                  {cell.day}
                </Text>
                {shiftType ? (
                  <Text
                    numberOfLines={1}
                    style={[styles.shiftLabel, hasColor ? styles.shiftLabelOnShift : styles.shiftLabelMuted]}
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
  weekdayRow: { flexDirection: "row", marginBottom: theme.spacing.sm },
  weekdayLabel: {
    textAlign: "center",
    color: theme.calendar.textMuted,
    fontSize: 12,
    fontFamily: theme.font.bold,
  },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  dayCell: {
    borderRadius: theme.radius.sm,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  emptyDayCell: { backgroundColor: theme.calendar.cellIdle },
  // Un giorno di riposo non ha il colore pieno di un turno: deve leggersi
  // subito come "non si lavora", non confondersi con un turno vero.
  restDayCell: { borderWidth: 1, borderColor: theme.calendar.border, borderStyle: "dashed" },
  todayBorder: { borderWidth: 2, borderColor: theme.calendar.text },
  dayNumber: { color: theme.calendar.text, fontSize: 15, fontFamily: theme.font.bold },
  dayNumberToday: { fontFamily: theme.font.extraBold },
  dayNumberOnShift: { fontFamily: theme.font.extraBold },
  // "numberOfLines=1" (nel JSX) + "maxWidth: 90%" tengono la sigla dentro i
  // bordi della cella anche a questa dimensione maggiore: se non ci sta,
  // viene troncata invece di sfondare il riquadro.
  shiftLabel: { fontSize: 14, fontFamily: theme.font.extraBold, maxWidth: "90%" },
  shiftLabelOnShift: { color: theme.calendar.text },
  shiftLabelMuted: { color: theme.calendar.textFaint },
  // Piccolo indicatore per i giorni con un orario personalizzato ("modifica singolo turno"), visibile a colpo d'occhio senza aprire il giorno.
  overrideDot: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.warning,
    borderWidth: 1.5,
    borderColor: theme.calendar.text,
  },
});
