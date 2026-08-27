/** Un tipo di turno definito dall'utente (es. "M" 06:00-14:00, sveglia alle 05:15). */
export interface ShiftType {
  id: string;
  label: string; // testo libero scelto dall'utente: "M", "Matt", "1", "M1"...
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  color: string; // colore usato nel calendario/legenda
  alarmEnabled: boolean;
  alarmTime?: string; // "HH:mm", richiesto se alarmEnabled
}

/** Turno assegnato a un giorno specifico. Chiave della mappa: "YYYY-MM-DD". */
export type CalendarEntries = Record<string, string>; // date -> shiftTypeId

export interface AppSettings {
  userName: string;
  autoAlarmEnabled: boolean;
  legendVisible: boolean;
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
}
