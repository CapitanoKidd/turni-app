import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { storage } from "./storage";
import type { CalendarEntries, ShiftType } from "./types";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function ensureNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

function parseHHmm(time: string): { hour: number; minute: number } {
  const [hour, minute] = time.split(":").map(Number);
  return { hour, minute };
}

/** Prossima occorrenza futura di date+time (le date passate vengono ignorate dal chiamante). */
function toTriggerDate(date: string, time: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const { hour, minute } = parseHHmm(time);
  return new Date(year, month - 1, day, hour, minute, 0);
}

async function cancelScheduled(dates: string[]): Promise<void> {
  const scheduled = await storage.getScheduledNotifications();
  for (const date of dates) {
    const id = scheduled[date];
    if (id) {
      await Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined);
      delete scheduled[date];
    }
  }
  await storage.saveScheduledNotifications(scheduled);
}

/**
 * Programma le sveglie per le date indicate (tipicamente un mese appena
 * importato), una per ogni giorno il cui tipo di turno ha la sveglia
 * attiva. Cancella prima eventuali sveglie gia' presenti per le stesse
 * date, cosi' un re-import non crea duplicati.
 */
export async function scheduleAlarmsForEntries(
  entries: CalendarEntries,
  shiftTypes: ShiftType[],
): Promise<number> {
  const dates = Object.keys(entries);
  await cancelScheduled(dates);

  const shiftTypeById = new Map(shiftTypes.map((s) => [s.id, s]));
  const scheduled = await storage.getScheduledNotifications();
  const now = new Date();
  let count = 0;

  for (const date of dates) {
    const shiftType = shiftTypeById.get(entries[date]);
    if (!shiftType?.alarmEnabled || !shiftType.alarmTime) continue;

    const triggerDate = toTriggerDate(date, shiftType.alarmTime);
    if (triggerDate <= now) continue; // non si programmano sveglie nel passato

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: "Sveglia turno",
        body: `Turno ${shiftType.label} (${shiftType.startTime}-${shiftType.endTime})`,
        sound: true,
      },
      trigger:
        Platform.OS === "android" ? { date: triggerDate, channelId: "shift-alarms" } : { date: triggerDate },
    });

    scheduled[date] = id;
    count += 1;
  }

  await storage.saveScheduledNotifications(scheduled);
  return count;
}

export async function cancelAlarmsForDates(dates: string[]): Promise<void> {
  await cancelScheduled(dates);
}

export async function cancelAllAlarms(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  await storage.saveScheduledNotifications({});
}

export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("shift-alarms", {
    name: "Sveglie turni",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default",
    vibrationPattern: [0, 250, 250, 250],
  });
}
