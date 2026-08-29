import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AppSettings, CalendarEntries, CellCodeMemory, PendingCellFingerprints, ScheduledNotifications, ShiftType } from "./types";

/**
 * Tutto lo stato dell'app vive solo sul dispositivo (nessun backend/DB):
 * qualche centinaio di voci al massimo, quindi AsyncStorage con documenti
 * JSON e' sufficiente e tiene lo scheletro semplice.
 */
const KEYS = {
  shiftTypes: "turni.shiftTypes",
  calendarEntries: "turni.calendarEntries",
  settings: "turni.settings",
  scheduledNotifications: "turni.scheduledNotifications",
  cellCodeMemory: "turni.cellCodeMemory",
  pendingCells: "turni.pendingCells",
} as const;

export const DEFAULT_SETTINGS: AppSettings = {
  userName: "",
  autoAlarmEnabled: false,
  legendVisible: true,
  debugMode: false,
};

async function readJson<T>(key: string, fallback: T): Promise<T> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson<T>(key: string, value: T): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export const storage = {
  /** Memoria dei simboli imparati (impronta -> codice), solo su questo telefono. */
  getCellCodeMemory: () => readJson<CellCodeMemory>(KEYS.cellCodeMemory, {}),
  saveCellCodeMemory: (memory: CellCodeMemory) => writeJson(KEYS.cellCodeMemory, memory),
  /** Aggiunge quanto imparato in un caricamento, senza perdere cio' che si sapeva gia'. */
  mergeCellCodeMemory: async (learned: CellCodeMemory) => {
    if (Object.keys(learned).length === 0) return;
    const current = await readJson<CellCodeMemory>(KEYS.cellCodeMemory, {});
    await writeJson(KEYS.cellCodeMemory, { ...current, ...learned });
  },

  getPendingCells: () => readJson<PendingCellFingerprints>(KEYS.pendingCells, {}),
  savePendingCells: (pending: PendingCellFingerprints) => writeJson(KEYS.pendingCells, pending),

  getShiftTypes: () => readJson<ShiftType[]>(KEYS.shiftTypes, []),
  saveShiftTypes: (shiftTypes: ShiftType[]) => writeJson(KEYS.shiftTypes, shiftTypes),

  getCalendarEntries: () => readJson<CalendarEntries>(KEYS.calendarEntries, {}),
  saveCalendarEntries: (entries: CalendarEntries) => writeJson(KEYS.calendarEntries, entries),

  getSettings: () => readJson<AppSettings>(KEYS.settings, DEFAULT_SETTINGS),
  saveSettings: (settings: AppSettings) => writeJson(KEYS.settings, settings),

  getScheduledNotifications: () => readJson<ScheduledNotifications>(KEYS.scheduledNotifications, {}),
  saveScheduledNotifications: (value: ScheduledNotifications) => writeJson(KEYS.scheduledNotifications, value),
};
