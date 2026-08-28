/** Un tipo di turno definito dall'utente (es. "M" 06:00-14:00, sveglia alle 05:15). */
export interface ShiftType {
  id: string;
  label: string; // testo libero scelto dall'utente: "M", "Matt", "1", "M1"...
  /** Giorno di riposo: nessun orario di lavoro e nessuna sveglia. Mai true insieme a isVacation. */
  isRestDay: boolean;
  /** Giorno di ferie: nessun orario di lavoro e nessuna sveglia. Mai true insieme a isRestDay. */
  isVacation: boolean;
  startTime?: string; // "HH:mm", assente se isRestDay o isVacation
  endTime?: string; // "HH:mm", assente se isRestDay o isVacation
  color: string; // colore usato nel calendario/legenda
  alarmEnabled: boolean;
  alarmTime?: string; // "HH:mm", richiesto se alarmEnabled
}

/** true se questo tipo di turno non prevede orario di lavoro (riposo o ferie). */
export function isDayOff(shiftType: ShiftType): boolean {
  return shiftType.isRestDay || shiftType.isVacation;
}

/** Turno assegnato a un giorno specifico. Chiave della mappa: "YYYY-MM-DD". */
export type CalendarEntries = Record<string, string>; // date -> shiftTypeId

export interface AppSettings {
  userName: string;
  autoAlarmEnabled: boolean;
  legendVisible: boolean;
  /** Mostra, dopo ogni caricamento, cosa ha rilevato davvero il motore di analisi (per capire perche' un turno manca). */
  debugMode: boolean;
}

/** Notifiche locali gia' programmate, per poterle cancellare/ri-schedulare. Chiave: "YYYY-MM-DD". */
export type ScheduledNotifications = Record<string, string>; // date -> notificationId

export interface DetectedShift {
  date: string; // YYYY-MM-DD
  rawCode: string;
  confidence: number;
}

export interface AnalyzeResponse {
  success: boolean;
  month?: number;
  year?: number;
  detectedShifts?: DetectedShift[];
  warnings?: string[];
  error?: string;
  /** Presente se il documento contiene i turni di piu' persone e serve scegliere quale riga e' la propria. */
  candidateNames?: string[];
  /** Presente solo con la modalita' debug attiva: cosa ha rilevato davvero il motore di analisi. */
  debugText?: string;
}
