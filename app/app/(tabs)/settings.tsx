import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { AlarmPicker } from "../../components/AlarmPicker";
import { ensureNotificationPermission, rescheduleAlarmsForShiftType } from "../../lib/notifications";
import { DEFAULT_SETTINGS, storage } from "../../lib/storage";
import { theme } from "../../lib/theme";
import { CopilotStep, WalkthroughableView, useRestartTutorial } from "../../lib/tutorial";
import type { AppSettings, ShiftType } from "../../lib/types";
import { isDayOff } from "../../lib/types";

/** La modalita' debug e' pensata per lo sviluppo, non per gli utenti finali: resta nascosta a meno che il nome inserito non sia proprio questo. */
const DEBUG_UNLOCK_NAME = "renato palumbo";

export default function SettingsScreen() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [shiftTypes, setShiftTypes] = useState<ShiftType[]>([]);

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);

  const [alarmShiftId, setAlarmShiftId] = useState<string | null>(null);
  const [alarmDraftEnabled, setAlarmDraftEnabled] = useState(false);
  const [alarmDraftTime, setAlarmDraftTime] = useState("05:15");

  useFocusEffect(
    useCallback(() => {
      Promise.all([storage.getSettings(), storage.getShiftTypes()]).then(([s, types]) => {
        setSettings(s);
        setShiftTypes(types);
        // Se non c'e' ancora un nome, si parte gia' in modalita' modifica:
        // non c'e' nessun nome statico da mostrare.
        setEditingName(!s.userName.trim());
        setNameDraft(s.userName);
      });
    }, []),
  );

  async function updateSettings(patch: Partial<AppSettings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    await storage.saveSettings(next);
  }

  function startEditingName() {
    setNameDraft(settings.userName);
    setNameError(null);
    setEditingName(true);
  }

  async function saveName() {
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      setNameError("Il nome non può essere vuoto.");
      return;
    }
    setNameError(null);
    await updateSettings({ userName: trimmed });
    setEditingName(false);
  }

  function cancelEditingName() {
    setNameDraft(settings.userName);
    setNameError(null);
    setEditingName(false);
  }

  function openAlarmEditor(shift: ShiftType) {
    setAlarmShiftId(shift.id);
    setAlarmDraftEnabled(shift.alarmEnabled);
    setAlarmDraftTime(shift.alarmTime ?? "05:15");
  }

  async function saveAlarmEditor() {
    if (!alarmShiftId) return;
    const shift = shiftTypes.find((s) => s.id === alarmShiftId);
    if (!shift) return;

    if (alarmDraftEnabled) {
      const granted = await ensureNotificationPermission();
      if (!granted) {
        setAlarmShiftId(null);
        return;
      }
    }

    const updated: ShiftType = {
      ...shift,
      alarmEnabled: alarmDraftEnabled,
      alarmTime: alarmDraftEnabled ? alarmDraftTime : undefined,
    };
    const next = shiftTypes.map((s) => (s.id === updated.id ? updated : s));
    setShiftTypes(next);
    await storage.saveShiftTypes(next);
    // Il turno puo' gia' essere assegnato a giorni del calendario: le
    // sveglie gia' programmate vanno riallineate al nuovo orario/stato.
    await rescheduleAlarmsForShiftType(updated.id, next);
    setAlarmShiftId(null);
  }

  const showDebugRow = settings.userName.trim().toLowerCase() === DEBUG_UNLOCK_NAME;
  const editingShift = shiftTypes.find((s) => s.id === alarmShiftId);

  const restartTutorial = useRestartTutorial();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <CopilotStep name="username-input" order={2} text="Inserisci il tuo nome: ci servirà per riconoscere la tua riga nei documenti che carichi.">
        <WalkthroughableView style={styles.section}>
          <Text style={styles.fieldLabel}>Nome utente</Text>
          {editingName ? (
            <>
              <TextInput
                style={styles.input}
                value={nameDraft}
                onChangeText={(value) => {
                  setNameDraft(value);
                  if (nameError) setNameError(null);
                }}
                placeholder="Il tuo nome"
                placeholderTextColor={theme.colors.textMuted}
                autoFocus={!settings.userName.trim()}
              />
              {nameError ? <Text style={styles.fieldError}>{nameError}</Text> : null}
              <View style={styles.nameActions}>
                {settings.userName.trim() ? (
                  <TouchableOpacity style={styles.nameSecondaryButton} onPress={cancelEditingName}>
                    <Text style={styles.nameSecondaryButtonText}>Annulla</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity style={styles.namePrimaryButton} onPress={saveName}>
                  <Text style={styles.namePrimaryButtonText}>Salva</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <View style={styles.nameDisplayRow}>
              <Text style={styles.nameDisplayText}>{settings.userName}</Text>
              <TouchableOpacity onPress={startEditingName}>
                <Text style={styles.nameEditLink}>Modifica</Text>
              </TouchableOpacity>
            </View>
          )}
        </WalkthroughableView>
      </CopilotStep>

      {showDebugRow ? (
        <View style={styles.section}>
          <Row
            title="Modalità debug"
            subtitle="Dopo ogni caricamento, mostra cosa ha rilevato davvero l'analisi"
            value={settings.debugMode}
            onValueChange={(debugMode) => updateSettings({ debugMode })}
          />
        </View>
      ) : null}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Gestisci turni</Text>
          <CopilotStep
            name="add-shift-button"
            order={3}
            text="Qui crei i tuoi turni (es. Mattina, Pomeriggio, Notte, Riposo). Su ognuno puoi impostare anche una sveglia dedicata toccando l'icona della sveglia sulla riga del turno."
          >
            <WalkthroughableView>
              <TouchableOpacity onPress={() => router.push("/shift-type-editor")}>
                <Text style={styles.addLink}>+ Nuovo</Text>
              </TouchableOpacity>
            </WalkthroughableView>
          </CopilotStep>
        </View>

        {shiftTypes.length === 0 ? (
          <Text style={styles.emptyText}>Nessun turno definito. I turni vengono creati anche automaticamente quando importi la griglia dalla Home.</Text>
        ) : (
          shiftTypes.map((shift) => (
            <View key={shift.id} style={styles.shiftRow}>
              <TouchableOpacity
                style={styles.shiftRowMain}
                onPress={() => router.push({ pathname: "/shift-type-editor", params: { id: shift.id } })}
              >
                <View style={[styles.dot, { backgroundColor: shift.color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.shiftLabel}>{shift.label}</Text>
                  <Text style={styles.shiftTime}>
                    {isDayOff(shift)
                      ? shift.isVacation
                        ? "Ferie"
                        : "Riposo"
                      : `${shift.startTime}-${shift.endTime}${shift.alarmEnabled ? ` · sveglia ${shift.alarmTime}` : ""}`}
                  </Text>
                </View>
              </TouchableOpacity>
              {!isDayOff(shift) ? (
                <TouchableOpacity style={styles.alarmIconButton} onPress={() => openAlarmEditor(shift)}>
                  <Ionicons
                    name={shift.alarmEnabled ? "alarm" : "alarm-outline"}
                    size={22}
                    color={shift.alarmEnabled ? theme.colors.primary : theme.colors.textMuted}
                  />
                </TouchableOpacity>
              ) : null}
            </View>
          ))
        )}
      </View>

      <TouchableOpacity onPress={restartTutorial}>
        <Text style={styles.replayTutorialLink}>Rivedi il tutorial</Text>
      </TouchableOpacity>

      <Text style={styles.privacyNote}>
        I file caricati per l'analisi non vengono mai salvati: vengono eliminati subito dopo la lettura dei turni.
      </Text>

      <Modal visible={editingShift !== undefined} transparent animationType="fade" onRequestClose={() => setAlarmShiftId(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setAlarmShiftId(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Sveglia · {editingShift?.label}</Text>
            <AlarmPicker
              enabled={alarmDraftEnabled}
              time={alarmDraftTime}
              onToggleEnabled={setAlarmDraftEnabled}
              onChangeTime={setAlarmDraftTime}
              label="Sveglia attiva"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.nameSecondaryButton} onPress={() => setAlarmShiftId(null)}>
                <Text style={styles.nameSecondaryButtonText}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.namePrimaryButton} onPress={saveAlarmEditor}>
                <Text style={styles.namePrimaryButtonText}>Salva</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, gap: theme.spacing.lg, paddingBottom: theme.spacing.xl },
  section: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: theme.spacing.md, gap: theme.spacing.sm },
  fieldLabel: { color: theme.colors.textMuted, fontSize: 13, fontWeight: "600" },
  fieldError: { color: theme.colors.danger, fontSize: 12 },
  input: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    color: theme.colors.text,
    fontSize: 16,
  },
  nameActions: { flexDirection: "row", justifyContent: "flex-end", gap: theme.spacing.sm },
  namePrimaryButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  namePrimaryButtonText: { color: theme.colors.primaryText, fontWeight: "700" },
  nameSecondaryButton: { paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm },
  nameSecondaryButtonText: { color: theme.colors.textMuted, fontWeight: "600" },
  nameDisplayRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  nameDisplayText: { color: theme.colors.text, fontSize: 16, fontWeight: "600" },
  nameEditLink: { color: theme.colors.primary, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md, paddingVertical: theme.spacing.xs },
  rowTitle: { color: theme.colors.text, fontSize: 15, fontWeight: "600" },
  rowSubtitle: { color: theme.colors.textMuted, fontSize: 12, marginTop: 2 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { color: theme.colors.text, fontWeight: "700", fontSize: 15 },
  addLink: { color: theme.colors.primary, fontWeight: "700" },
  emptyText: { color: theme.colors.textMuted, fontSize: 13 },
  shiftRow: { flexDirection: "row", alignItems: "center" },
  shiftRowMain: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, paddingVertical: theme.spacing.xs, flex: 1 },
  alarmIconButton: { padding: theme.spacing.xs },
  dot: { width: 14, height: 14, borderRadius: 7 },
  shiftLabel: { color: theme.colors.text, fontSize: 15, fontWeight: "600" },
  shiftTime: { color: theme.colors.textMuted, fontSize: 12 },
  privacyNote: { color: theme.colors.textMuted, fontSize: 12, textAlign: "center" },
  replayTutorialLink: { color: theme.colors.primary, fontSize: 13, fontWeight: "600", textAlign: "center" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: theme.spacing.lg },
  modalCard: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, padding: theme.spacing.lg, gap: theme.spacing.md },
  modalTitle: { color: theme.colors.text, fontSize: 17, fontWeight: "700" },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: theme.spacing.sm },
});
