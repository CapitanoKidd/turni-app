import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  AppSettings,
  CalendarEntries,
  CalendarOverrides,
  CellCodeMemory,
  PendingCellFingerprints,
  ScheduledNotifications,
  ShiftType,
} from "./types";

/**
 * Tutto lo stato dell'app vive solo sul dispositivo (nessun backend/DB):
 * qualche centinaio di voci al massimo, quindi AsyncStorage con documenti
 * JSON e' sufficiente e tiene lo scheletro semplice.
 */
const KEYS = {
  shiftTypes: "turni.shiftTypes",
  calendarEntries: "turni.calendarEntries",
  calendarOverrides: "turni.calendarOverrides",
  settings: "turni.settings",
  scheduledNotifications: "turni.scheduledNotifications",
  cellCodeMemory: "turni.cellCodeMemory",
  pendingCells: "turni.pendingCells",
  dailyUploadUsage: "turni.dailyUploadUsage",
  tutorialCompleted: "turni.tutorialCompleted",
} as const;

export const DEFAULT_SETTINGS: AppSettings = {
  userName: "",
  debugMode: false,
};

interface DailyUploadUsage {
  date: string; // YYYY-MM-DD locale, per capire quando resettare il conteggio
  count: number;
}

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

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

  /** Orari personalizzati per singolo giorno ("modifica singolo turno"), separati dai turni assegnati. */
  getCalendarOverrides: () => readJson<CalendarOverrides>(KEYS.calendarOverrides, {}),
  saveCalendarOverrides: (overrides: CalendarOverrides) => writeJson(KEYS.calendarOverrides, overrides),

  getSettings: () => readJson<AppSettings>(KEYS.settings, DEFAULT_SETTINGS),
  saveSettings: (settings: AppSettings) => writeJson(KEYS.settings, settings),

  getScheduledNotifications: () => readJson<ScheduledNotifications>(KEYS.scheduledNotifications, {}),
  saveScheduledNotifications: (value: ScheduledNotifications) => writeJson(KEYS.scheduledNotifications, value),

  /**
   * Consuma un caricamento dal limite giornaliero: incrementa il contatore
   * (azzerandolo se il giorno e' cambiato) e restituisce true se era sotto
   * il limite, false se il limite era gia' raggiunto (in tal caso NON
   * incrementa, cosi' il contatore non supera mai il limite mostrato).
   * Protezione lato dispositivo, non lato server: aggirabile da chi
   * manomette l'app, ma e' l'unica misura ragionevole senza un account.
   */
  consumeDailyUpload: async (limit: number): Promise<boolean> => {
    const today = todayIso();
    const usage = await readJson<DailyUploadUsage>(KEYS.dailyUploadUsage, { date: today, count: 0 });
    const current = usage.date === today ? usage.count : 0;
    if (current >= limit) return false;
    await writeJson<DailyUploadUsage>(KEYS.dailyUploadUsage, { date: today, count: current + 1 });
    return true;
  },

  /** true dopo che l'utente ha completato (o saltato) il tutorial guidato alla prima apertura. */
  getTutorialCompleted: () => readJson<boolean>(KEYS.tutorialCompleted, false),
  setTutorialCompleted: (value: boolean) => writeJson(KEYS.tutorialCompleted, value),
};
