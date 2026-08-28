import { findStaffPage } from "./findStaffPage.js";
import type { ExtractedTable, OcrProvider } from "./ocr/types.js";
import { extractSinglePagePdf, rasterizeAllPages, rasterizePage } from "./pdfRasterizer.js";
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

    const singlePagePdf = await extractSinglePagePdf(buffer, staffPage.pageIndex);
    debug.push(`inviata ad Azure: SOLO la pagina ${staffPage.pageIndex + 1}, in formato PDF (1 chiamata)`);

    const tables = await provider.extractTables(singlePagePdf, PDF_MIME);
    const result = parseShiftGrid(tables, target, staffName);
    debug.push(`Azure ha restituito ${tables.length} tabella/e — copertura ${Math.round(result.coverage * 100)}%`);

    const sentPreviewImages = options.debug ? [await rasterizePage(singlePagePdf, 0)] : [];
    return { result, tables, debug, sentPreviewImages };
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
  return { result, tables, debug, sentPreviewImages };
}
