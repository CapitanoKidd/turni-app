import type { ExtractedTable, TableCell } from "./ocr/types.js";

export interface DetectedShift {
  date: string; // YYYY-MM-DD
  rawCode: string;
  confidence: number;
}

export interface ShiftGridParseResult {
  detectedShifts: DetectedShift[];
  warnings: string[];
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
 * Strategia A: griglie "calendario" dove ogni cella contiene sia il numero
 * del giorno sia il codice turno (es. "14\nM", "14 - M", "14M"), come accade
 * spesso in foto/PDF di calendari mensili.
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
 * Strategia B: griglie a due assi, con una riga (o colonna) di numeri di
 * giorno e la riga (o colonna) immediatamente successiva con i codici turno.
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

/** Trova la riga/colonna dove piu' della meta' delle celle non vuote sono numeri di giorno validi. */
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

/**
 * Converte le tabelle grezze estratte da OCR/docx in una lista di turni per
 * giorno. Euristica v1: prova prima le griglie "calendario" (giorno+codice
 * nella stessa cella), poi le griglie a due assi separati; se la copertura
 * resta bassa segnala un warning per invitare l'utente a verificare.
 */
export function parseShiftGrid(tables: ExtractedTable[], target: TargetMonth): ShiftGridParseResult {
  const warnings: string[] = [];

  if (tables.length === 0) {
    return {
      detectedShifts: [],
      warnings: ["Nessuna tabella riconosciuta nel documento: prova con una foto piu' nitida o un altro formato."],
    };
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
