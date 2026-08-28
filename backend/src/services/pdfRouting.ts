import { findStaffPage } from "./findStaffPage.js";
import { fillGapsFromCellImages } from "./fillGapsFromCellImages.js";
import type { ExtractedTable, OcrProvider, RecognizedWord } from "./ocr/types.js";
import { extractSinglePagePdf, rasterizeAllPages, rasterizePage } from "./pdfRasterizer.js";
import { readShiftsFromPdfText } from "./readShiftsFromPdfText.js";
import { parseShiftGrid, type ShiftGridParseResult } from "./shiftGridParser.js";

export const PDF_MIME = "application/pdf";
export const PNG_MIME = "image/png";

/** Quante pagine al massimo trasformare in anteprima per il debug (solo visualizzazione, nessun costo Azure). */
const MAX_PREVIEW_PAGES = 3;

export interface PdfRoutingOutcome {
  result: ShiftGridParseResult;
  /** Le tabelle grezze restituite da Azure: cosa ha letto davvero, cella per cella. */
  tables: ExtractedTable[];
  debug: string[];
  /**
   * Anteprima di CIO' CHE E' STATO INVIATO ad Azure, solo in modalita' debug.
   * Attenzione: ad Azure viene inviato un PDF, non un'immagine; queste sono le
   * stesse identiche pagine inviate, disegnate come immagine qui sul nostro
   * server per poterle guardare. Non costano nessuna chiamata ad Azure.
   */
  sentPreviewImages: Buffer[];
  /**
   * Giorni il cui disegno non e' stato letto in nessun punto del documento:
   * l'unica cosa che resta da chiedere all'utente. Vuoto quando tutto e'
   * stato risolto.
   */
  unresolvedCells?: Array<{ date: string; fingerprint: string }>;
  /**
   * Le parole che l'OCR dice di aver riconosciuto, con la loro confidenza.
   * Arrivano nella stessa risposta delle tabelle (nessuna chiamata in piu').
   * Servono a capire se una cella vuota e' "non vista" o "vista ma non
   * assegnata alla cella".
   */
  recognizedWords: RecognizedWord[];
}

export interface PdfRoutingOptions {
  /** Se true, genera le anteprime di cosa e' stato inviato (costa solo CPU locale, nessuna chiamata Azure). */
  debug?: boolean;
}

/**
 * Risolve i turni di un PDF con UNA SOLA chiamata ad Azure, sempre.
 *
 * 1. Cerca localmente (gratis, nessuna chiamata Azure) la pagina che contiene
 *    il nome dell'utente, usando il testo gia' incorporato nel PDF.
 * 2. Se la trova, ritaglia SOLO quella pagina e la invia ad Azure come PDF:
 *    e' l'unica chiamata a pagamento dell'intera procedura.
 * 3. Se non la trova (PDF scansionato senza testo, nome assente o non
 *    fornito), invia l'intero documento: sempre una chiamata sola.
 *
 * Nessun secondo tentativo: se il risultato e' parziale viene restituito
 * cosi' com'e', e i giorni mancanti vengono mostrati all'utente come "vuoto"
 * perche' li completi a mano. Una seconda chiamata (rasterizzando la pagina
 * e rimandandola come immagine) e' stata provata e rimossa: sul documento
 * reale di test non ha mai recuperato un solo giorno, raddoppiando il costo
 * per nulla.
 */
export async function resolvePdfShiftResult(
  buffer: Buffer,
  target: { year: number; month1To12: number },
  staffName: string | undefined,
  provider: OcrProvider,
  options: PdfRoutingOptions = {},
): Promise<PdfRoutingOutcome> {
  const debug: string[] = [];
  const staffPage = await findStaffPage(buffer, staffName);

  if (staffPage) {
    debug.push(
      `pagina ${staffPage.pageIndex + 1} trovata localmente per "${staffName}" (punteggio ${staffPage.score.toFixed(2)}) — nessun costo`,
    );

    // Prima di spendere: se i codici turno sono TESTO dentro il PDF li
    // leggiamo qui, gratis ed esattamente. Nessuna chiamata al servizio.
    const fromText = await readShiftsFromPdfText(buffer, staffPage.pageIndex, target, staffName);
    if (fromText) {
      debug.push(
        `turni letti direttamente dal testo del PDF: ${fromText.detectedShifts.length} giorni (${Math.round(fromText.coverage * 100)}%) — NESSUNA chiamata ad Azure`,
      );
      return {
        result: { detectedShifts: fromText.detectedShifts, warnings: [], coverage: fromText.coverage },
        tables: [],
        debug,
        sentPreviewImages: options.debug ? [await rasterizePage(buffer, staffPage.pageIndex)] : [],
        recognizedWords: [],
        unresolvedCells: [],
      };
    }
    debug.push("i codici turno non sono testo nel PDF: serve l'analisi");

    const singlePagePdf = await extractSinglePagePdf(buffer, staffPage.pageIndex);
    debug.push(`inviata ad Azure: SOLO la pagina ${staffPage.pageIndex + 1}, in formato PDF (1 chiamata)`);

    const tables = await provider.extractTables(singlePagePdf, PDF_MIME);
    const result = parseShiftGrid(tables, target, staffName);
    debug.push(`Azure ha restituito ${tables.length} tabella/e — copertura ${Math.round(result.coverage * 100)}%`);

    // Completamento locale (nessuna chiamata in piu'): molte turnistiche
    // disegnano i codici come piccole immagini riutilizzate, quindi una cella
    // rimasta vuota spesso contiene lo stesso identico disegno di una che
    // l'analisi ha letto bene altrove.
    const hasAmbiguousName = (result.candidateNames?.length ?? 0) > 0;
    const filled =
      hasAmbiguousName || !staffName
        ? null
        : await fillGapsFromCellImages({
            buffer,
            pageIndex: staffPage.pageIndex,
            tables,
            target,
            staffName,
            detectedShifts: result.detectedShifts,
          });

    const finalResult = filled
      ? { ...result, detectedShifts: filled.detectedShifts, coverage: filled.detectedShifts.length / totalDaysOf(target) }
      : result;
    if (filled) debug.push(...filled.debug);
    if (filled && filled.detectedShifts.length !== result.detectedShifts.length) {
      debug.push(`copertura dopo il completamento locale: ${Math.round(finalResult.coverage * 100)}%`);
    }

    const sentPreviewImages = options.debug ? [await rasterizePage(singlePagePdf, 0)] : [];
    return {
      result: finalResult,
      tables,
      debug,
      sentPreviewImages,
      recognizedWords: provider.getLastRecognizedWords?.() ?? [],
      unresolvedCells: filled?.unresolved ?? [],
    };
  }

  debug.push(
    staffName
      ? `nessuna pagina trovata localmente per "${staffName}": invio l'intero documento`
      : "nessun nome utente fornito: invio l'intero documento",
  );
  debug.push("inviato ad Azure: l'intero documento, in formato PDF (1 chiamata)");

  const tables = await provider.extractTables(buffer, PDF_MIME);
  const result = parseShiftGrid(tables, target, staffName);
  debug.push(`Azure ha restituito ${tables.length} tabella/e — copertura ${Math.round(result.coverage * 100)}%`);

  const sentPreviewImages = options.debug
    ? (await rasterizeAllPages(buffer)).slice(0, MAX_PREVIEW_PAGES)
    : [];
  return { result, tables, debug, sentPreviewImages, recognizedWords: provider.getLastRecognizedWords?.() ?? [] };
}

function totalDaysOf(target: { year: number; month1To12: number }): number {
  return new Date(target.year, target.month1To12, 0).getDate();
}
