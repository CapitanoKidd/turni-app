import type { ExtractedTable, TableCell } from "./ocr/types.js";

export interface DetectedShift {
  date: string; // YYYY-MM-DD
  rawCode: string;
  confidence: number;
}

export interface ShiftGridParseResult {
  detectedShifts: DetectedShift[];
  warnings: string[];
  /**
   * Presente quando il documento e' una turnistica con piu' persone (una
   * riga per dipendente) e non siamo riusciti ad abbinare con sicurezza il
   * nome fornito a una riga: contiene i nomi trovati, cosi' l'app puo'
   * chiedere all'utente "quale di questi sei?" invece di indovinare.
   */
  candidateNames?: string[];
  /** Quota di giorni del mese per cui e' stato trovato un turno (0-1). Utile a chi chiama per decidere se il risultato e' abbastanza buono da fidarsene. */
  coverage: number;
}

interface TargetMonth {
  year: number;
  month1To12: number;
}

function daysInMonth({ year, month1To12 }: TargetMonth): number {
  return new Date(year, month1To12, 0).getDate();
}

function toIsoDate({ year, month1To12 }: TargetMonth, day: number): string {
  const mm = String(month1To12).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/** true se il testo e' interamente/quasi un numero di giorno valido (1-31). */
function parseDayNumber(text: string): number | null {
  const trimmed = text.trim();
  const match = trimmed.match(/^(\d{1,2})$/);
  if (!match) return null;
  const value = Number(match[1]);
  return value >= 1 && value <= 31 ? value : null;
}

/**
 * Estrae un numero di giorno da celle di intestazione anche "composte", tipo
 * "Sa\n01", "Lun 1", o "33 Mo 10" (numero di settimana + giorno della
 * settimana + numero, unito da Azure in un'unica cella ai confini tra due
 * settimane). Richiede pero' che l'INTERO testo della cella sia solo
 * "numero di settimana opzionale + giorno della settimana opzionale + numero
 * di giorno": questo evita falsi positivi su celle di riepilogo come
 * "Soll Aug.26" (che finirebbe altrimenti riconosciuta come giorno 26).
 */
function extractTrailingDayNumber(text: string): number | null {
  const match = text
    .trim()
    .match(/^(?:\d{1,2}\s+)?(?:[A-Za-zÀ-ÿ]{1,3}\.?\s+)?(\d{1,2})\s*$/);
  if (!match) return null;
  const value = Number(match[1]);
  return value >= 1 && value <= 31 ? value : null;
}

/**
 * Prende solo il "codice" principale di una cella turno, scartando eventuali
 * annotazioni su una riga separata sotto al codice (es. "1\n4O" -> "1",
 * "UU\n5O" -> "UU") — comune nei fogli con percentuali/note sotto il turno.
 */
function extractPrimaryCode(text: string): string {
  const firstToken = text.trim().split(/\s+/)[0] ?? "";
  return firstToken;
}

/**
 * true solo se la cella e' vuota. Un trattino o simile (spesso usato per
 * indicare "riposo") viene trattato come un codice a tutti gli effetti:
 * sara' l'utente a definirlo nella revisione, esattamente come per "M" o
 * "R" — l'app non decide da sola cosa significa un simbolo del foglio.
 */
function isBlankMarker(code: string): boolean {
  return code.length === 0;
}

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

const MIN_DAY_SEQUENCE_RUN = 5;

/**
 * Trova la riga/colonna dei giorni cercando la piu' lunga sequenza di numeri
 * consecutivi crescenti (1, 2, 3, 4...) tra le celle ordinate per posizione.
 * E' un segnale molto piu' affidabile del "conta quante celle sono un
 * numero valido": una riga di turni piena di codici numerici come "1", "2",
 * "3" avrebbe anche lei molte celle che sembrano giorni validi, ma i suoi
 * valori non sono mai in ordine crescente come lo sono i giorni del mese.
 */
function findDayAxis(groups: Map<number, TableCell[]>, _totalDays: number): number | null {
  let bestIndex: number | null = null;
  let bestRun = 0;

  for (const [index, cells] of groups) {
    const sorted = [...cells].sort((a, b) => a.columnIndex - b.columnIndex || a.rowIndex - b.rowIndex);
    let currentRun = 0;
    let longestRun = 0;
    let previous: number | null = null;

    for (const cell of sorted) {
      const day = extractTrailingDayNumber(cell.text);
      if (day === null) {
        currentRun = 0;
        previous = null;
        continue;
      }
      currentRun = previous !== null && day === previous + 1 ? currentRun + 1 : 1;
      previous = day;
      longestRun = Math.max(longestRun, currentRun);
    }

    if (longestRun >= MIN_DAY_SEQUENCE_RUN && longestRun > bestRun) {
      bestRun = longestRun;
      bestIndex = index;
    }
  }

  return bestIndex;
}

/**
 * Strategia A: griglie "calendario" di una sola persona, dove ogni cella
 * contiene sia il numero del giorno sia il codice turno (es. "14\nM"), come
 * accade spesso in foto/PDF di calendari mensili personali.
 */
function parseCombinedCells(tables: ExtractedTable[], target: TargetMonth): DetectedShift[] {
  const combinedPattern = /^(\d{1,2})\s*[\n\-:.]?\s*([A-Za-z][A-Za-z0-9]{0,4})?$/;
  const found: DetectedShift[] = [];
  const totalDays = daysInMonth(target);

  for (const table of tables) {
    for (const cell of table.cells) {
      const match = cell.text.trim().match(combinedPattern);
      if (!match) continue;
      const day = Number(match[1]);
      const code = match[2];
      if (day < 1 || day > totalDays || !code) continue;
      found.push({ date: toIsoDate(target, day), rawCode: code.toUpperCase(), confidence: 0.75 });
    }
  }

  return found;
}

/**
 * Strategia B: griglie di una sola persona a due assi, con una riga (o
 * colonna) di numeri di giorno e la riga (o colonna) immediatamente
 * successiva con i codici turno.
 */
function parseTwoAxisTables(tables: ExtractedTable[], target: TargetMonth): DetectedShift[] {
  const found: DetectedShift[] = [];
  const totalDays = daysInMonth(target);

  for (const table of tables) {
    const byRow = groupBy(table.cells, (c) => c.rowIndex);
    const dayRowIndex = findDayAxis(byRow, totalDays);
    if (dayRowIndex !== null) {
      const dayCells = byRow.get(dayRowIndex) ?? [];
      const codeCells = byRow.get(dayRowIndex + 1) ?? [];
      found.push(...matchAxisPairs(dayCells, codeCells, "columnIndex", target, totalDays));
      continue;
    }

    const byColumn = groupBy(table.cells, (c) => c.columnIndex);
    const dayColIndex = findDayAxis(byColumn, totalDays);
    if (dayColIndex !== null) {
      const dayCells = byColumn.get(dayColIndex) ?? [];
      const codeCells = byColumn.get(dayColIndex + 1) ?? [];
      found.push(...matchAxisPairs(dayCells, codeCells, "rowIndex", target, totalDays));
    }
  }

  return found;
}

function matchAxisPairs(
  dayCells: TableCell[],
  codeCells: TableCell[],
  perpendicularKey: "rowIndex" | "columnIndex",
  target: TargetMonth,
  totalDays: number,
): DetectedShift[] {
  const codeByPosition = new Map(codeCells.map((c) => [c[perpendicularKey], c]));
  const results: DetectedShift[] = [];

  for (const dayCell of dayCells) {
    const day = extractTrailingDayNumber(dayCell.text);
    if (day === null || day > totalDays) continue;
    const codeCell = codeByPosition.get(dayCell[perpendicularKey]);
    const code = codeCell ? extractPrimaryCode(codeCell.text) : "";
    if (isBlankMarker(code)) continue;
    results.push({ date: toIsoDate(target, day), rawCode: code.toUpperCase(), confidence: 0.6 });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Strategia C: turnistiche multi-persona (una riga per dipendente, una
// colonna per giorno del mese) — il formato usato dai fogli Excel di reparto.
// ---------------------------------------------------------------------------

export function normalizeName(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function nameWords(text: string): string[] {
  return normalizeName(text).split(" ").filter(Boolean);
}

/** Quanto il nome di una riga corrisponde al nome cercato: frazione delle parole cercate trovate nel nome della riga. */
export function nameMatchScore(rowName: string, targetName: string): number {
  const target = nameWords(targetName);
  if (target.length === 0) return 0;
  const row = new Set(nameWords(rowName));
  const matched = target.filter((w) => row.has(w)).length;
  return matched / target.length;
}

interface RosterTable {
  table: ExtractedTable;
  headerRowIndex: number;
  dayByColumn: Map<number, number>; // columnIndex -> giorno del mese
  nameColumn: number;
  rowNames: Map<number, string>; // rowIndex -> testo colonna nome (righe dati)
}

/** Individua, se presente, la colonna che contiene i nomi dei dipendenti in una tabella con riga di intestazione = giorni del mese. */
/**
 * Da un insieme di celle di intestazione lette con sicurezza (colonna ->
 * giorno), deduce la colonna di TUTTI i giorni del mese assumendo che la
 * griglia segua un passo costante (quasi sempre una colonna per giorno,
 * es. colonna 3 = giorno 1, colonna 4 = giorno 2...). Serve perche' Azure
 * non legge sempre l'intestazione nello stesso modo tra una chiamata e
 * l'altra (a volte fonde due giorni vicini in un'unica cella): le righe con
 * i turni veri restano invece stabili, quindi conviene ricostruire la
 * mappa dei giorni per posizione invece di dipendere dal riuscire a
 * leggere ogni singola cella di intestazione.
 */
function inferDayByColumn(confident: Map<number, number>, totalDays: number): Map<number, number> {
  if (confident.size < 3) return confident; // troppo poche ancore per fidarsi di un passo dedotto

  const offsetCounts = new Map<number, number>();
  for (const [columnIndex, day] of confident) {
    const offset = columnIndex - day;
    offsetCounts.set(offset, (offsetCounts.get(offset) ?? 0) + 1);
  }
  const [dominantOffset, dominantCount] = [...offsetCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (dominantCount / confident.size < 0.6) return confident; // passo poco chiaro: meglio non indovinare oltre

  const result = new Map(confident);
  for (let day = 1; day <= totalDays; day++) {
    const columnIndex = day + dominantOffset;
    if (!result.has(columnIndex)) result.set(columnIndex, day);
  }
  return result;
}

function detectRosterTable(table: ExtractedTable, target: TargetMonth): RosterTable | null {
  const totalDays = daysInMonth(target);
  const byRow = groupBy(table.cells, (c) => c.rowIndex);
  const headerRowIndex = findDayAxis(byRow, totalDays);
  if (headerRowIndex === null) return null;

  // Alcune turnistiche spezzano l'intestazione dei giorni su piu' righe (es.
  // weekend e settimane a cavallo finiscono su una riga diversa da quella
  // principale). Si fondono percio' un paio di righe sopra a quella
  // "principale" (trovata da findDayAxis): le colonne mancanti nella riga
  // principale vengono recuperate da li', quella principale ha comunque
  // sempre l'ultima parola in caso di conflitto.
  const HEADER_ROW_WINDOW = 3;
  const confidentDayByColumn = new Map<number, number>();
  for (let rowIndex = Math.max(0, headerRowIndex - HEADER_ROW_WINDOW + 1); rowIndex <= headerRowIndex; rowIndex++) {
    for (const cell of byRow.get(rowIndex) ?? []) {
      const day = extractTrailingDayNumber(cell.text);
      if (day !== null) confidentDayByColumn.set(cell.columnIndex, day);
    }
  }
  // Le colonne la cui intestazione non si legge bene quella volta (fusa con
  // quella accanto, ecc.) vengono comunque dedotte dal passo delle altre.
  const dayByColumn = inferDayByColumn(confidentDayByColumn, totalDays);
  if (dayByColumn.size < 5) return null; // troppo poche colonne-giorno per essere una turnistica del mese

  const minDayColumn = Math.min(...dayByColumn.keys());
  const dataRows = [...byRow.entries()].filter(([rowIndex]) => rowIndex > headerRowIndex);

  // Colonne a sinistra dei giorni: candidate a contenere il nome del dipendente.
  const candidateColumns = new Set<number>();
  for (const [, cells] of dataRows) {
    for (const cell of cells) {
      if (cell.columnIndex < minDayColumn) candidateColumns.add(cell.columnIndex);
    }
  }

  let bestColumn: number | null = null;
  let bestScore = 0;
  for (const columnIndex of candidateColumns) {
    let nameLike = 0;
    let nonEmpty = 0;
    for (const [, cells] of dataRows) {
      const cell = cells.find((c) => c.columnIndex === columnIndex);
      const text = cell?.text.trim() ?? "";
      if (!text) continue;
      nonEmpty += 1;
      // Un nome ha piu' lettere che cifre ed e' abbastanza lungo da non essere un codice turno.
      const letters = (text.match(/[A-Za-zÀ-ÿ]/g) ?? []).length;
      if (letters >= 3 && letters / text.length > 0.6) nameLike += 1;
    }
    const score = nonEmpty > 0 ? nameLike / nonEmpty : 0;
    if (score > bestScore) {
      bestScore = score;
      bestColumn = columnIndex;
    }
  }
  if (bestColumn === null || bestScore < 0.5) return null;

  const rowNames = new Map<number, string>();
  for (const [rowIndex, cells] of dataRows) {
    const text = cells.find((c) => c.columnIndex === bestColumn)?.text.trim();
    if (text) rowNames.set(rowIndex, text);
  }

  return { table, headerRowIndex, dayByColumn, nameColumn: bestColumn, rowNames };
}

function extractRowShifts(roster: RosterTable, rowIndex: number, target: TargetMonth): DetectedShift[] {
  const cellsInRow = roster.table.cells.filter((c) => c.rowIndex === rowIndex);
  const byColumn = new Map(cellsInRow.map((c) => [c.columnIndex, c.text]));
  const seenDates = new Set<string>();
  const results: DetectedShift[] = [];

  for (const [columnIndex, day] of roster.dayByColumn) {
    const rawText = byColumn.get(columnIndex);
    if (!rawText) continue;
    // Il codice vero e' la prima riga della cella: alcune turnistiche mettono
    // un'annotazione (es. una percentuale) su una seconda riga sotto al codice.
    const code = extractPrimaryCode(rawText);
    if (isBlankMarker(code)) continue; // "-" o simili: nessun turno quel giorno

    const date = toIsoDate(target, day);
    if (seenDates.has(date)) continue; // due colonne non dovrebbero mai indicare lo stesso giorno
    seenDates.add(date);

    results.push({ date, rawCode: code.toUpperCase(), confidence: 0.85 });
  }

  // roster.dayByColumn viene attraversato nell'ordine in cui le colonne sono
  // state inserite (che ora unisce piu' righe di intestazione), non in
  // ordine di data: senza questo i turni arrivano all'app mescolati.
  return results.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Prova la strategia "turnistica multi-persona": cerca tabelle con una riga
 * di giorni e una colonna di nomi, poi individua la riga che corrisponde a
 * `staffName`. Se trova piu' tabelle di questo tipo controlla tutte, cosi'
 * l'utente puo' caricare l'intero foglio anche se ha piu' schede/tabelle.
 */
function tryRosterStrategy(
  tables: ExtractedTable[],
  target: TargetMonth,
  staffName: string | undefined,
): { detectedShifts: DetectedShift[]; candidateNames: string[]; isRoster: boolean } {
  const rosterTables = tables
    .map((table) => detectRosterTable(table, target))
    .filter((r): r is RosterTable => r !== null);

  if (rosterTables.length === 0) {
    return { detectedShifts: [], candidateNames: [], isRoster: false };
  }

  const allCandidates: string[] = [];
  let bestMatch: { roster: RosterTable; rowIndex: number; score: number } | null = null;
  let secondBestScore = 0;

  for (const roster of rosterTables) {
    for (const [rowIndex, name] of roster.rowNames) {
      allCandidates.push(name);
      if (!staffName) continue;
      const score = nameMatchScore(name, staffName);
      if (!bestMatch || score > bestMatch.score) {
        secondBestScore = bestMatch?.score ?? 0;
        bestMatch = { roster, rowIndex, score };
      } else if (score > secondBestScore) {
        secondBestScore = score;
      }
    }
  }

  const candidateNames = [...new Set(allCandidates)];
  const isConfident = bestMatch !== null && bestMatch.score >= 0.5 && bestMatch.score - secondBestScore >= 0.3;

  if (isConfident && bestMatch) {
    return {
      detectedShifts: extractRowShifts(bestMatch.roster, bestMatch.rowIndex, target),
      candidateNames: [],
      isRoster: true,
    };
  }

  return { detectedShifts: [], candidateNames, isRoster: true };
}

/**
 * Assicura che ci sia un giorno per OGNI giorno del mese, anche quando la
 * cella era vuota o il suo contenuto non e' stato riconosciuto: un giorno
 * "vuoto" (rawCode: "") viene comunque restituito invece di sparire dal
 * risultato, cosi' chi chiama puo' mostrarlo esplicitamente all'utente
 * ("8 agosto: vuoto") che decide lui se lasciarlo cosi', assegnare un turno
 * a mano o segnarlo come riposo/ferie — invece di scoprire "in silenzio"
 * che un giorno manca.
 *
 * Va applicata UNA SOLA VOLTA, alla fine di tutta la pipeline (dopo l'unione
 * fra lettura diretta e rasterizzata in pdfRouting.ts, in analyze.ts prima
 * di rispondere): un risultato intermedio deve restare "sparso" (solo i
 * giorni davvero trovati), perche' la fase di merge si basa proprio su quali
 * date mancano per capire cosa completare dal secondo tentativo. Applicarla
 * prima renderebbe ogni risultato "pieno" per costruzione e romperebbe quel
 * meccanismo.
 */
export function withEveryDayOfMonth(detectedShifts: DetectedShift[], target: TargetMonth): DetectedShift[] {
  const totalDays = daysInMonth(target);
  const byDate = new Map(detectedShifts.map((s) => [s.date, s]));
  const result: DetectedShift[] = [];
  for (let day = 1; day <= totalDays; day++) {
    const date = toIsoDate(target, day);
    result.push(byDate.get(date) ?? { date, rawCode: "", confidence: 0 });
  }
  return result;
}

/**
 * Converte le tabelle grezze estratte da OCR/docx in una lista di turni per
 * giorno. Prova, in ordine: (1) turnistica multi-persona se il documento ha
 * quella forma (serve `staffName` per sapere quale riga prendere); (2)
 * calendario "giorno+codice nella stessa cella"; (3) griglia a due assi.
 * Se la copertura resta bassa segnala un warning.
 */
export function parseShiftGrid(
  tables: ExtractedTable[],
  target: TargetMonth,
  staffName?: string,
): ShiftGridParseResult {
  const warnings: string[] = [];

  if (tables.length === 0) {
    return {
      detectedShifts: [],
      warnings: ["Nessuna tabella riconosciuta nel documento: prova con una foto piu' nitida o un altro formato."],
      coverage: 0,
    };
  }

  const roster = tryRosterStrategy(tables, target, staffName);
  if (roster.isRoster) {
    if (roster.candidateNames.length > 0) {
      return {
        detectedShifts: [],
        warnings: [
          staffName
            ? `Non ho trovato con certezza "${staffName}" nell'elenco: scegli il tuo nome dalla lista.`
            : "Questo documento contiene i turni di piu' persone: scegli il tuo nome dalla lista.",
        ],
        candidateNames: roster.candidateNames,
        coverage: 0,
      };
    }
    const totalDays = daysInMonth(target);
    const coverage = roster.detectedShifts.length / totalDays;
    if (coverage < 0.5) {
      warnings.push(
        `Riconosciuti solo ${roster.detectedShifts.length} giorni su ${totalDays}: controlla e completa manualmente i turni mancanti.`,
      );
    }
    return { detectedShifts: roster.detectedShifts, warnings, coverage };
  }

  const combined = parseCombinedCells(tables, target);
  const twoAxis = parseTwoAxisTables(tables, target);

  const byDate = new Map<string, DetectedShift>();
  for (const shift of [...twoAxis, ...combined]) {
    const existing = byDate.get(shift.date);
    if (!existing || shift.confidence > existing.confidence) {
      byDate.set(shift.date, shift);
    }
  }

  const detectedShifts = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  const totalDays = daysInMonth(target);
  const coverage = detectedShifts.length / totalDays;

  if (coverage < 0.5) {
    warnings.push(
      `Riconosciuti solo ${detectedShifts.length} giorni su ${totalDays}: controlla e completa manualmente i turni mancanti.`,
    );
  }

  return { detectedShifts, warnings, coverage };
}
