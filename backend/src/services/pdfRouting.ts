import { findStaffPage } from "./findStaffPage.js";
import type { ExtractedTable, OcrProvider } from "./ocr/types.js";
import { extractSinglePagePdf, rasterizeAllPages, rasterizePage } from "./pdfRasterizer.js";
import { parseShiftGrid, type ShiftGridParseResult } from "./shiftGridParser.js";

export const PDF_MIME = "application/pdf";
export const PNG_MIME = "image/png";
const LOW_COVERAGE_THRESHOLD = 0.5;

export interface PdfRoutingOutcome {
  result: ShiftGridParseResult;
  /** Le tabelle grezze usate per il risultato scelto: utili per la modalita' debug (vedere cosa ha rilevato Azure). */
  tables: ExtractedTable[];
  debug: string[];
}

interface Attempt {
  tables: ExtractedTable[];
  result: ShiftGridParseResult;
}

/**
 * Un risultato "scarso" non e' abbastanza affidabile da fermarsi li'.
 * Un'ambiguita' sul nome (candidateNames) non conta come scarso: in quel
 * caso serve chiedere all'utente quale riga e' la sua, non riprovare con
 * un'altra elaborazione dello stesso identico documento.
 */
export function isWeakResult(result: ShiftGridParseResult): boolean {
  if (result.candidateNames && result.candidateNames.length > 0) return false;
  return result.coverage < LOW_COVERAGE_THRESHOLD;
}

/** Tra due risultati per lo stesso documento, tiene quello con piu' turni riconosciuti. */
export function pickBetterResult(a: ShiftGridParseResult, b: ShiftGridParseResult): ShiftGridParseResult {
  if (b.detectedShifts.length > a.detectedShifts.length) return b;
  if (
    b.detectedShifts.length === a.detectedShifts.length &&
    (b.candidateNames?.length ?? 0) > (a.candidateNames?.length ?? 0)
  ) {
    return b;
  }
  return a;
}

function pickBetterAttempt(a: Attempt, b: Attempt): Attempt {
  return pickBetterResult(a.result, b.result) === b.result ? b : a;
}

/**
 * Unisce due risultati per lo STESSO documento (es. lettura diretta e
 * rasterizzata della stessa pagina): tiene tutti i turni del primo e
 * riempie solo le date mancanti con quelli del secondo. Meglio di "prendi
 * il migliore dei due" quando un tentativo trova alcuni giorni che
 * all'altro sfuggono e viceversa (es. celle che l'estrazione diretta lascia
 * vuote ma che l'OCR sull'immagine legge correttamente, o viceversa).
 */
function mergeShiftResults(
  primary: ShiftGridParseResult,
  secondary: ShiftGridParseResult,
  totalDays: number,
): ShiftGridParseResult {
  if (primary.candidateNames && primary.candidateNames.length > 0) return primary;

  const byDate = new Map(primary.detectedShifts.map((s) => [s.date, s]));
  for (const shift of secondary.detectedShifts) {
    if (!byDate.has(shift.date)) byDate.set(shift.date, shift);
  }

  const detectedShifts = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  const coverage = detectedShifts.length / totalDays;
  const warnings =
    coverage < LOW_COVERAGE_THRESHOLD
      ? [
          `Riconosciuti solo ${detectedShifts.length} giorni su ${totalDays} anche unendo lettura diretta e rasterizzata: controlla e completa manualmente i turni mancanti.`,
        ]
      : [];

  return { detectedShifts, warnings, coverage };
}

/**
 * Risolve i turni di un PDF processando il meno possibile:
 * 1. Cerca localmente (gratis, nessuna chiamata Azure) la pagina che
 *    contiene il nome dell'utente, usando il testo vero incorporato nel PDF.
 * 2. Se trovata, prova SOLO quella pagina ad Azure, esattamente come oggi
 *    (nessun percorso parallelo: stessa `provider.extractTables`).
 * 3. Se il risultato resta scarso, rasterizza SOLO quella pagina e la
 *    rimanda ad Azure come se fosse una foto (stessa funzione usata per le
 *    foto caricate dall'utente).
 * 4. Se nessuna pagina e' stata trovata al passo 1 (PDF scansionato senza
 *    testo, o nome non presente/non fornito), si processa l'intero
 *    documento esattamente come si faceva prima di questo cambiamento —
 *    mai una regressione — e solo se anche quello ha copertura bassa si
 *    rasterizzano tutte le pagine.
 */
export async function resolvePdfShiftResult(
  buffer: Buffer,
  target: { year: number; month1To12: number },
  staffName: string | undefined,
  provider: OcrProvider,
): Promise<PdfRoutingOutcome> {
  const debug: string[] = [];
  const staffPage = await findStaffPage(buffer, staffName);

  if (staffPage) {
    debug.push(
      `pagina ${staffPage.pageIndex + 1} trovata localmente per "${staffName}" (punteggio ${staffPage.score.toFixed(2)})`,
    );

    const singlePagePdf = await extractSinglePagePdf(buffer, staffPage.pageIndex);
    const directTables = await provider.extractTables(singlePagePdf, PDF_MIME);
    const direct: Attempt = { tables: directTables, result: parseShiftGrid(directTables, target, staffName) };
    debug.push(`analisi diretta pagina ${staffPage.pageIndex + 1}: copertura ${Math.round(direct.result.coverage * 100)}%`);

    const hasAmbiguousName = (direct.result.candidateNames?.length ?? 0) > 0;
    if (hasAmbiguousName || direct.result.coverage >= 1) {
      return { ...direct, debug };
    }

    // Anche con una copertura gia' accettabile puo' mancare qualche giorno
    // (celle che l'estrazione diretta lascia vuote): si prova comunque la
    // stessa pagina rasterizzata, costa una sola pagina Azure in piu', e si
    // uniscono i due risultati invece di scartarne uno intero.
    debug.push(`copertura non completa: rasterizzo comunque la pagina ${staffPage.pageIndex + 1} per completare i giorni mancanti`);
    const rasterizedPng = await rasterizePage(buffer, staffPage.pageIndex);
    const rasterizedTables = await provider.extractTables(rasterizedPng, PNG_MIME);
    const rasterizedResult = parseShiftGrid(rasterizedTables, target, staffName);
    debug.push(`analisi rasterizzata pagina ${staffPage.pageIndex + 1}: copertura ${Math.round(rasterizedResult.coverage * 100)}%`);

    const totalDays = new Date(target.year, target.month1To12, 0).getDate();
    const merged = mergeShiftResults(direct.result, rasterizedResult, totalDays);
    debug.push(`risultato unito (diretta + rasterizzata): copertura ${Math.round(merged.coverage * 100)}%`);

    return { result: merged, tables: [...direct.tables, ...rasterizedTables], debug };
  }

  debug.push(
    staffName
      ? `nessuna pagina trovata localmente per "${staffName}": elaboro l'intero documento`
      : "nessun nome utente fornito: elaboro l'intero documento",
  );

  const wholeDocTables = await provider.extractTables(buffer, PDF_MIME);
  const wholeDoc: Attempt = { tables: wholeDocTables, result: parseShiftGrid(wholeDocTables, target, staffName) };
  debug.push(`analisi diretta intero documento: copertura ${Math.round(wholeDoc.result.coverage * 100)}%`);

  if (!isWeakResult(wholeDoc.result)) {
    return { ...wholeDoc, debug };
  }

  debug.push("copertura scarsa: rasterizzo tutte le pagine e riprovo");
  const pages = await rasterizeAllPages(buffer);
  const rasterizedTables = (await Promise.all(pages.map((png) => provider.extractTables(png, PNG_MIME)))).flat();
  const rasterized: Attempt = { tables: rasterizedTables, result: parseShiftGrid(rasterizedTables, target, staffName) };
  debug.push(`analisi rasterizzata intero documento: copertura ${Math.round(rasterized.result.coverage * 100)}%`);

  return { ...pickBetterAttempt(wholeDoc, rasterized), debug };
}
