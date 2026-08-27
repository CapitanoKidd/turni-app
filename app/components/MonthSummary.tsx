import { StyleSheet, Text, View } from "react-native";
import { theme } from "../lib/theme";
import type { CalendarEntries, ShiftType } from "../lib/types";

interface MonthSummaryProps {
  year: number;
  month1To12: number;
  entries: CalendarEntries;
  shiftTypes: ShiftType[];
}

/** Quanti giorni di ogni turno ci sono nel mese visualizzato (es. "M = 3, P = 10"). */
export function MonthSummary({ year, month1To12, entries, shiftTypes }: MonthSummaryProps) {
  const shiftTypeById = new Map(shiftTypes.map((s) => [s.id, s]));
  const monthPrefix = `${year}-${String(month1To12).padStart(2, "0")}`;

  const counts = new Map<string, number>(); // shiftTypeId -> quante volte questo mese
  for (const [date, shiftTypeId] of Object.entries(entries)) {
    if (!date.startsWith(monthPrefix)) continue;
    counts.set(shiftTypeId, (counts.get(shiftTypeId) ?? 0) + 1);
  }

  const rows = [...counts.entries()]
    .map(([id, count]) => ({ shiftType: shiftTypeById.get(id), count }))
    .filter((row): row is { shiftType: ShiftType; count: number } => Boolean(row.shiftType))
    .sort((a, b) => b.count - a.count);

  if (rows.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Riepilogo del mese</Text>
      <View style={styles.grid}>
        {rows.map(({ shiftType, count }) => (
          <View key={shiftType.id} style={styles.row}>
            <View style={[styles.dot, { backgroundColor: shiftType.color }]} />
            <Text style={styles.label} numberOfLines={1}>
              {shiftType.label}
            </Text>
            <Text style={styles.count}>{count}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  title: { color: theme.colors.text, fontWeight: "700", fontSize: 15 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    minWidth: "30%",
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  label: { color: theme.colors.text, fontSize: 13, fontWeight: "600", flexShrink: 1 },
  count: { color: theme.colors.textMuted, fontSize: 13, fontWeight: "700", marginLeft: "auto" },
});
