import { findStaffPage } from "./findStaffPage.js";
import type { OcrProvider } from "./ocr/types.js";
import { extractSinglePagePdf, rasterizeAllPages, rasterizePage } from "./pdfRasterizer.js";
import { parseShiftGrid, type ShiftGridParseResult } from "./shiftGridParser.js";

export const PDF_MIME = "application/pdf";
export const PNG_MIME = "image/png";
const LOW_COVERAGE_THRESHOLD = 0.5;

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
): Promise<{ result: ShiftGridParseResult; debug: string[] }> {
  const debug: string[] = [];
  const staffPage = await findStaffPage(buffer, staffName);

  if (staffPage) {
    debug.push(
      `pagina ${staffPage.pageIndex + 1} trovata localmente per "${staffName}" (punteggio ${staffPage.score.toFixed(2)})`,
    );

    const singlePagePdf = await extractSinglePagePdf(buffer, staffPage.pageIndex);
    const directTables = await provider.extractTables(singlePagePdf, PDF_MIME);
    const directResult = parseShiftGrid(directTables, target, staffName);
    debug.push(`analisi diretta pagina ${staffPage.pageIndex + 1}: copertura ${Math.round(directResult.coverage * 100)}%`);

    if (!isWeakResult(directResult)) {
      return { result: directResult, debug };
    }

    debug.push(`copertura scarsa: rasterizzo solo la pagina ${staffPage.pageIndex + 1} e riprovo`);
    const rasterized = await rasterizePage(buffer, staffPage.pageIndex);
    const rasterizedTables = await provider.extractTables(rasterized, PNG_MIME);
    const rasterizedResult = parseShiftGrid(rasterizedTables, target, staffName);
    debug.push(`analisi rasterizzata pagina ${staffPage.pageIndex + 1}: copertura ${Math.round(rasterizedResult.coverage * 100)}%`);

    return { result: pickBetterResult(directResult, rasterizedResult), debug };
  }

  debug.push(
    staffName
      ? `nessuna pagina trovata localmente per "${staffName}": elaboro l'intero documento`
      : "nessun nome utente fornito: elaboro l'intero documento",
  );

  const wholeDocTables = await provider.extractTables(buffer, PDF_MIME);
  const wholeDocResult = parseShiftGrid(wholeDocTables, target, staffName);
  debug.push(`analisi diretta intero documento: copertura ${Math.round(wholeDocResult.coverage * 100)}%`);

  if (!isWeakResult(wholeDocResult)) {
    return { result: wholeDocResult, debug };
  }

  debug.push("copertura scarsa: rasterizzo tutte le pagine e riprovo");
  const pages = await rasterizeAllPages(buffer);
  const rasterizedTables = (await Promise.all(pages.map((png) => provider.extractTables(png, PNG_MIME)))).flat();
  const rasterizedResult = parseShiftGrid(rasterizedTables, target, staffName);
  debug.push(`analisi rasterizzata intero documento: copertura ${Math.round(rasterizedResult.coverage * 100)}%`);

  return { result: pickBetterResult(wholeDocResult, rasterizedResult), debug };
}
