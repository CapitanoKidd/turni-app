import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { cancelAllAlarms, ensureNotificationPermission, scheduleAlarmsForEntries } from "../../lib/notifications";
import { DEFAULT_SETTINGS, storage } from "../../lib/storage";
import { theme } from "../../lib/theme";
import type { AppSettings, ShiftType } from "../../lib/types";

export default function SettingsScreen() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [shiftTypes, setShiftTypes] = useState<ShiftType[]>([]);

  useFocusEffect(
    useCallback(() => {
      Promise.all([storage.getSettings(), storage.getShiftTypes()]).then(([s, types]) => {
        setSettings(s);
        setShiftTypes(types);
      });
    }, []),
  );

  async function updateSettings(patch: Partial<AppSettings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    await storage.saveSettings(next);
  }

  async function handleToggleAutoAlarm(value: boolean) {
    await updateSettings({ autoAlarmEnabled: value });
    if (!value) {
      await cancelAllAlarms();
      return;
    }
    const granted = await ensureNotificationPermission();
    if (!granted) return;
    const entries = await storage.getCalendarEntries();
    await scheduleAlarmsForEntries(entries, shiftTypes);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <Text style={styles.fieldLabel}>Nome utente</Text>
        <TextInput
          style={styles.input}
          value={settings.userName}
          onChangeText={(userName) => setSettings((s) => ({ ...s, userName }))}
          onEndEditing={() => storage.saveSettings(settings)}
          placeholder="Il tuo nome"
          placeholderTextColor={theme.colors.textMuted}
        />
      </View>

      <View style={styles.section}>
        <Row
          title="Sveglia automatica"
          subtitle="Imposta le sveglie quando importi/modifichi turni"
          value={settings.autoAlarmEnabled}
          onValueChange={handleToggleAutoAlarm}
        />
        <Divider />
        <Row
          title="Legenda turni"
          subtitle="Mostra la legenda colori nel calendario"
          value={settings.legendVisible}
          onValueChange={(legendVisible) => updateSettings({ legendVisible })}
        />
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Gestisci turni</Text>
          <TouchableOpacity onPress={() => router.push("/shift-type-editor")}>
            <Text style={styles.addLink}>+ Nuovo</Text>
          </TouchableOpacity>
        </View>

        {shiftTypes.length === 0 ? (
          <Text style={styles.emptyText}>Nessun turno definito. I turni vengono creati anche automaticamente quando importi la griglia dalla Home.</Text>
        ) : (
          shiftTypes.map((shift) => (
            <TouchableOpacity
              key={shift.id}
              style={styles.shiftRow}
              onPress={() => router.push({ pathname: "/shift-type-editor", params: { id: shift.id } })}
            >
              <View style={[styles.dot, { backgroundColor: shift.color }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.shiftLabel}>{shift.label}</Text>
                <Text style={styles.shiftTime}>
                  {shift.isRestDay
                    ? "Riposo/ferie"
                    : `${shift.startTime}-${shift.endTime}${shift.alarmEnabled ? ` · sveglia ${shift.alarmTime}` : ""}`}
                </Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>

      <Text style={styles.privacyNote}>
        I file caricati per l'analisi non vengono mai salvati: vengono eliminati subito dopo la lettura dei turni.
      </Text>
    </ScrollView>
  );
}

function Row({
  title,
  subtitle,
  value,
  onValueChange,
}: {
  title: string;
  subtitle: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSubtitle}>{subtitle}</Text>
      </View>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, gap: theme.spacing.lg, paddingBottom: theme.spacing.xl },
  section: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: theme.spacing.md, gap: theme.spacing.sm },
  fieldLabel: { color: theme.colors.textMuted, fontSize: 13, fontWeight: "600" },
  input: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    color: theme.colors.text,
    fontSize: 16,
  },
  row: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md, paddingVertical: theme.spacing.xs },
  rowTitle: { color: theme.colors.text, fontSize: 15, fontWeight: "600" },
  rowSubtitle: { color: theme.colors.textMuted, fontSize: 12, marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.border },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { color: theme.colors.text, fontWeight: "700", fontSize: 15 },
  addLink: { color: theme.colors.primary, fontWeight: "700" },
  emptyText: { color: theme.colors.textMuted, fontSize: 13 },
  shiftRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, paddingVertical: theme.spacing.xs },
  dot: { width: 14, height: 14, borderRadius: 7 },
  shiftLabel: { color: theme.colors.text, fontSize: 15, fontWeight: "600" },
  shiftTime: { color: theme.colors.textMuted, fontSize: 12 },
  privacyNote: { color: theme.colors.textMuted, fontSize: 12, textAlign: "center" },
});
