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

/** Trova la riga/colonna dove piu' della meta' delle celle non vuote sono numeri di giorno validi, preferendo quella con piu' corrispondenze (es. la vera riga dei giorni batte righe di riepilogo piu' corte). */
function findDayAxis(groups: Map<number, TableCell[]>, totalDays: number): number | null {
  let bestIndex: number | null = null;
  let bestScore = 0;

  for (const [index, cells] of groups) {
    const nonEmpty = cells.filter((c) => c.text.trim().length > 0);
    if (nonEmpty.length === 0) continue;
    const dayLike = nonEmpty.filter((c) => parseDayNumber(c.text) !== null).length;
    const score = dayLike / nonEmpty.length;
    if (score > 0.5 && dayLike > bestScore) {
      bestScore = dayLike;
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
    const day = parseDayNumber(dayCell.text);
    if (day === null || day > totalDays) continue;
    const codeCell = codeByPosition.get(dayCell[perpendicularKey]);
    const code = codeCell?.text.trim();
    if (!code) continue;
    results.push({ date: toIsoDate(target, day), rawCode: code.toUpperCase(), confidence: 0.6 });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Strategia C: turnistiche multi-persona (una riga per dipendente, una
// colonna per giorno del mese) — il formato usato dai fogli Excel di reparto.
// ---------------------------------------------------------------------------

function normalizeName(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nameWords(text: string): string[] {
  return normalizeName(text).split(" ").filter(Boolean);
}

/** Quanto il nome di una riga corrisponde al nome cercato: frazione delle parole cercate trovate nel nome della riga. */
function nameMatchScore(rowName: string, targetName: string): number {
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
function detectRosterTable(table: ExtractedTable, target: TargetMonth): RosterTable | null {
  const totalDays = daysInMonth(target);
  const byRow = groupBy(table.cells, (c) => c.rowIndex);
  const headerRowIndex = findDayAxis(byRow, totalDays);
  if (headerRowIndex === null) return null;

  const dayByColumn = new Map<number, number>();
  for (const cell of byRow.get(headerRowIndex) ?? []) {
    const day = parseDayNumber(cell.text);
    if (day !== null) dayByColumn.set(cell.columnIndex, day);
  }
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
  const byColumn = new Map(cellsInRow.map((c) => [c.columnIndex, c.text.trim()]));
  const results: DetectedShift[] = [];

  for (const [columnIndex, day] of roster.dayByColumn) {
    const code = byColumn.get(columnIndex);
    if (!code) continue;
    results.push({ date: toIsoDate(target, day), rawCode: code.toUpperCase(), confidence: 0.85 });
  }

  return results;
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
      };
    }
    const totalDays = daysInMonth(target);
    const coverage = roster.detectedShifts.length / totalDays;
    if (coverage < 0.5) {
      warnings.push(
        `Riconosciuti solo ${roster.detectedShifts.length} giorni su ${totalDays}: controlla e completa manualmente i turni mancanti.`,
      );
    }
    return { detectedShifts: roster.detectedShifts, warnings };
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

  return { detectedShifts, warnings };
}
