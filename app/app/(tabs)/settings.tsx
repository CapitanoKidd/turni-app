import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AlarmPicker } from "../../components/AlarmPicker";
import { withAlpha } from "../../lib/color";
import { ensureNotificationPermission, rescheduleAlarmsForShiftType } from "../../lib/notifications";
import { DEFAULT_SETTINGS, storage } from "../../lib/storage";
import { theme } from "../../lib/theme";
import { TutorialDim, TutorialTarget, useRestartTutorial } from "../../lib/tutorial";
import type { AppSettings, ShiftType } from "../../lib/types";
import { isDayOff } from "../../lib/types";

const APP_VERSION = Constants.expoConfig?.version ?? "1.0";

/**
 * La modalita' debug e' pensata per lo sviluppo, non per gli utenti finali: resta nascosta a meno che il nome inserito non sia proprio questo.
 * TODO(pre-pubblicazione): rimuovere del tutto la riga "Modalita' debug" (sotto, condizionale su showDebugRow)
 * e il link "Rivedi il tutorial" (in fondo alla schermata) prima di pubblicare sullo store.
 */
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
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={{ gap: 2 }}>
        <Text style={styles.pageTitle}>Impostazioni</Text>
        <Text style={styles.versionCaption}>Turni · versione {APP_VERSION}</Text>
      </View>

      <TutorialTarget name="username-input" style={styles.section}>
        <Text style={styles.fieldLabel}>Nome nel prospetto</Text>
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
            <View style={styles.nameCheckIcon}>
              <Ionicons name="checkmark" size={16} color={theme.colors.primaryText} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.nameDisplayText}>{settings.userName}</Text>
              <Text style={styles.nameSavedCaption}>Salvato sul dispositivo</Text>
            </View>
            <TouchableOpacity style={styles.nameEditLinkRow} onPress={startEditingName}>
              <Ionicons name="pencil-outline" size={14} color={theme.colors.primary} />
              <Text style={styles.nameEditLink}>Modifica</Text>
            </TouchableOpacity>
          </View>
        )}
      </TutorialTarget>

      {showDebugRow ? (
        <TutorialDim style={styles.section}>
          <Row
            title="Modalità debug"
            subtitle="Dopo ogni caricamento, mostra cosa ha rilevato davvero l'analisi"
            value={settings.debugMode}
            onValueChange={(debugMode) => updateSettings({ debugMode })}
          />
        </TutorialDim>
      ) : null}

      {/*
        L'intera card (intestazione + elenco) e' il bersaglio dello step: il
        testo spiega sia la creazione dei turni sia la sveglia per turno, che
        riguardano tutta la card, non solo il link "+ Nuovo".
      */}
      <TutorialTarget name="add-shift-button" style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Turni</Text>
          <TouchableOpacity style={styles.addButton} onPress={() => router.push("/shift-type-editor")} activeOpacity={0.85}>
            <Ionicons name="add" size={16} color={theme.colors.primaryText} />
            <Text style={styles.addButtonText}>Aggiungi</Text>
          </TouchableOpacity>
        </View>

        {shiftTypes.length === 0 ? (
          <Text style={styles.emptyText}>Nessun turno definito. I turni vengono creati anche automaticamente quando importi la griglia dalla Home.</Text>
        ) : (
          shiftTypes.map((shift, index) => (
            <View key={shift.id} style={[styles.shiftRow, index > 0 && styles.shiftRowDivider]}>
              <TouchableOpacity
                style={styles.shiftRowMain}
                onPress={() => router.push({ pathname: "/shift-type-editor", params: { id: shift.id } })}
              >
                <View
                  style={[
                    styles.shiftAvatar,
                    { backgroundColor: shift.color ? withAlpha(shift.color, 0.16) : theme.colors.surfaceAlt },
                  ]}
                >
                  {shift.color ? (
                    <Text style={[styles.shiftAvatarText, { color: shift.color }]}>
                      {shift.label.trim().charAt(0).toUpperCase() || "?"}
                    </Text>
                  ) : (
                    <Ionicons name="ban-outline" size={16} color={theme.colors.textFaint} />
                  )}
                </View>
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
                <TouchableOpacity
                  style={[styles.alarmIconButton, shift.alarmEnabled && styles.alarmIconButtonActive]}
                  onPress={() => openAlarmEditor(shift)}
                >
                  <Ionicons
                    name={shift.alarmEnabled ? "alarm" : "alarm-outline"}
                    size={19}
                    color={shift.alarmEnabled ? theme.colors.primary : theme.colors.textMuted}
                  />
                </TouchableOpacity>
              ) : null}
            </View>
          ))
        )}
      </TutorialTarget>

      <TutorialDim style={{ gap: theme.spacing.lg }}>
        <TouchableOpacity onPress={restartTutorial}>
          <Text style={styles.replayTutorialLink}>Rivedi il tutorial</Text>
        </TouchableOpacity>

        <Text style={styles.privacyNote}>
          I file caricati per l'analisi non vengono mai salvati: vengono eliminati subito dopo la lettura dei turni.
        </Text>
      </TutorialDim>

      <Modal visible={editingShift !== undefined} transparent animationType="fade" onRequestClose={() => setAlarmShiftId(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setAlarmShiftId(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHandle} />
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
    </SafeAreaView>
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
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: theme.colors.border, true: theme.colors.primaryMuted }}
        thumbColor={value ? theme.colors.primary : theme.colors.textFaint}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, gap: theme.spacing.lg, paddingBottom: theme.spacing.xl },
  section: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadow.card,
  },
  pageTitle: { ...theme.typography.title, color: theme.colors.text },
  versionCaption: { ...theme.typography.caption, color: theme.colors.textFaint },
  fieldLabel: { ...theme.typography.label, color: theme.colors.textFaint },
  fieldError: { color: theme.colors.danger, fontSize: 12 },
  input: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    color: theme.colors.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  nameActions: { flexDirection: "row", justifyContent: "flex-end", gap: theme.spacing.sm },
  namePrimaryButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  namePrimaryButtonText: { color: theme.colors.primaryText, fontFamily: theme.font.bold },
  nameSecondaryButton: { paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm },
  nameSecondaryButtonText: { color: theme.colors.textMuted, fontFamily: theme.font.semiBold },
  nameDisplayRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
  nameCheckIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  nameDisplayText: { color: theme.colors.text, fontSize: 16, fontFamily: theme.font.semiBold },
  nameSavedCaption: { color: theme.colors.textFaint, fontSize: 12, marginTop: 1 },
  nameEditLinkRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  nameEditLink: { color: theme.colors.primary, fontFamily: theme.font.bold },
  row: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md, paddingVertical: theme.spacing.xs },
  rowTitle: { color: theme.colors.text, fontSize: 15, fontFamily: theme.font.semiBold },
  rowSubtitle: { color: theme.colors.textMuted, fontSize: 12, marginTop: 2 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { ...theme.typography.subheading, color: theme.colors.text },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 8,
  },
  addButtonText: { color: theme.colors.primaryText, fontFamily: theme.font.bold, fontSize: 13 },
  emptyText: { color: theme.colors.textMuted, fontSize: 13, lineHeight: 19 },
  shiftRow: { flexDirection: "row", alignItems: "center" },
  shiftRowDivider: { borderTopWidth: 1, borderTopColor: theme.colors.border },
  shiftRowMain: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, paddingVertical: theme.spacing.sm, flex: 1 },
  alarmIconButton: {
    padding: theme.spacing.xs,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceAlt,
  },
  alarmIconButtonActive: { backgroundColor: theme.colors.primaryMuted },
  shiftAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  shiftAvatarText: { fontSize: 15, fontFamily: theme.font.extraBold },
  shiftLabel: { color: theme.colors.text, fontSize: 15, fontFamily: theme.font.semiBold },
  shiftTime: { color: theme.colors.textMuted, fontSize: 12, marginTop: 1 },
  privacyNote: { ...theme.typography.caption, color: theme.colors.textFaint, textAlign: "center" },
  replayTutorialLink: { color: theme.colors.primary, fontSize: 13, fontFamily: theme.font.semiBold, textAlign: "center" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(4,8,16,0.72)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: theme.colors.surfaceElevated,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
    gap: theme.spacing.md,
    ...theme.shadow.elevated,
  },
  modalHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    marginBottom: theme.spacing.xs,
  },
  modalTitle: { ...theme.typography.heading, color: theme.colors.text },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: theme.spacing.sm },
});
