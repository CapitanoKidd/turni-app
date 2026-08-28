import { StyleSheet, Text, View } from "react-native";
import { theme } from "../lib/theme";
import { isDayOff, type CalendarEntries, type ShiftType } from "../lib/types";

interface MonthSummaryProps {
  year: number;
  month1To12: number;
  entries: CalendarEntries;
  shiftTypes: ShiftType[];
}

interface SummaryRow {
  shiftType: ShiftType;
  count: number;
}

/**
 * Quanti giorni di ogni turno ci sono nel mese visualizzato, divisi in tre
 * gruppi (turni di lavoro, riposo, ferie) cosi' l'utente vede subito quanti
 * giorni lavora e quanti no, senza doverli sommare a mano dalla legenda.
 */
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
    .filter((row): row is SummaryRow => Boolean(row.shiftType));

  if (rows.length === 0) return null;

  const byCount = (a: SummaryRow, b: SummaryRow) => b.count - a.count;
  const workRows = rows.filter((r) => !isDayOff(r.shiftType)).sort(byCount);
  const restRows = rows.filter((r) => r.shiftType.isRestDay).sort(byCount);
  const vacationRows = rows.filter((r) => r.shiftType.isVacation).sort(byCount);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Riepilogo del mese</Text>
      <SummaryGroup label="Turni" rows={workRows} />
      <SummaryGroup label="Riposo" rows={restRows} />
      <SummaryGroup label="Ferie" rows={vacationRows} />
    </View>
  );
}

function SummaryGroup({ label, rows }: { label: string; rows: SummaryRow[] }) {
  if (rows.length === 0) return null;
  const total = rows.reduce((sum, r) => sum + r.count, 0);

  return (
    <View style={styles.group}>
      <Text style={styles.groupLabel}>
        {label} · {total}
      </Text>
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
  group: { gap: 6 },
  groupLabel: { color: theme.colors.textMuted, fontSize: 12, fontWeight: "700", textTransform: "uppercase" },
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
