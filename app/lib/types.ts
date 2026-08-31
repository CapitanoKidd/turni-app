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
  /** Colore usato nel calendario/legenda, o null per "nessun colore" (default per i turni di riposo/ferie: se l'utente ne assegna comunque uno, va rispettato ovunque, calendario incluso). */
  color: string | null;
  alarmEnabled: boolean;
  alarmTime?: string; // "HH:mm", richiesto se alarmEnabled
}

/** true se questo tipo di turno non prevede orario di lavoro (riposo o ferie). */
export function isDayOff(shiftType: ShiftType): boolean {
  return shiftType.isRestDay || shiftType.isVacation;
}

/** Turno assegnato a un giorno specifico. Chiave della mappa: "YYYY-MM-DD". */
export type CalendarEntries = Record<string, string>; // date -> shiftTypeId

/**
 * Scostamento eccezionale dall'orario standard di UN giorno: il tipo di
 * turno resta lo stesso (stesso colore, stessa sveglia), cambia solo
 * l'orario di quel giorno (es. "oggi esco un'ora prima").
 */
export interface DayShiftOverride {
  startTime: string;
  endTime: string;
}

/** Orari personalizzati per giorno. Chiave della mappa: "YYYY-MM-DD". */
export type CalendarOverrides = Record<string, DayShiftOverride>;

export interface AppSettings {
  userName: string;
  /** Mostra, dopo ogni caricamento, cosa ha rilevato davvero il motore di analisi (per capire perche' un turno manca). Visibile in Impostazioni solo per l'utente "Renato Palumbo". */
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
  /** Presente solo con la modalita' debug attiva su un PDF rasterizzato: le immagini (data URI) effettivamente inviate ad Azure, per vedere con i propri occhi cosa "vede" Azure. */
  debugImages?: string[];
  /** Giorni il cui simbolo non e' stato riconosciuto da nessuna parte: quando l'utente li completa a mano, l'app impara. */
  unresolvedCells?: Array<{ date: string; fingerprint: string }>;
  /** Simboli riconosciuti in questo documento (impronta -> codice): l'app li conserva per i caricamenti futuri. */
  learnedCells?: Record<string, string>;
}

/**
 * Memoria dei simboli: impronta del disegno di una cella -> codice turno.
 * Vive solo sul telefono (nessun account, nessun server). Serve perche' molte
 * turnistiche disegnano i codici come immagini invece che come testo: una
 * volta imparato cosa significa un disegno, i mesi successivi lo riconoscono
 * subito.
 */
export type CellCodeMemory = Record<string, string>;

/** Giorni di cui conosciamo il disegno ma non ancora il significato: se l'utente li completa a mano, quel significato lo impariamo. */
export type PendingCellFingerprints = Record<string, string>; // data -> impronta
