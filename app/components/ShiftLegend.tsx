import { StyleSheet, Text, View } from "react-native";
import { theme } from "../lib/theme";
import type { ShiftType } from "../lib/types";

export function ShiftLegend({ shiftTypes }: { shiftTypes: ShiftType[] }) {
  if (shiftTypes.length === 0) return null;

  return (
    <View style={styles.container}>
      {shiftTypes.map((shift) => (
        <View key={shift.id} style={styles.item}>
          <View style={[styles.dot, { backgroundColor: shift.color }]} />
          <Text style={styles.label}>
            {shift.label} · {shift.startTime}-{shift.endTime}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm, marginTop: theme.spacing.md },
  item: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  label: { color: theme.colors.textMuted, fontSize: 12 },
});
