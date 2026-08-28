import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";
import { PDFDocument } from "pdf-lib";
import type { StaffRowBand } from "./findStaffPage.js";

const DEFAULT_DPI = 300;
const PDF_BASE_DPI = 72; // un "punto" PDF corrisponde a 1/72 di pollice
const HEADER_MARGIN_PX = 25; // margine sotto l'ultima riga di intestazione, per non tagliarla a filo
const ROW_MARGIN_PX = 15; // margine sotto la fascia della riga dati
const BAND_GAP_PX = 12; // spazio bianco fra le due fasce nell'immagine composta

/** Numero di pagine di un PDF, senza fare altro lavoro. */
export async function countPdfPages(buffer: Buffer): Promise<number> {
  const doc = await getDocument({ data: new Uint8Array(buffer) }).promise;
  const count = doc.numPages;
  doc.cleanup();
  return count;
}

/**
 * Rasterizza una singola pagina del PDF in un PNG ad alta risoluzione, cosi'
 * puo' essere inviata ad Azure con lo stesso identico percorso gia' usato
 * per le foto caricate dall'utente (nessun percorso parallelo).
 */
export async function rasterizePage(buffer: Buffer, pageIndex: number, dpi: number = DEFAULT_DPI): Promise<Buffer> {
  const doc = await getDocument({ data: new Uint8Array(buffer) }).promise;
  try {
    const page = await doc.getPage(pageIndex + 1); // pdfjs-dist usa pagine 1-based
    const viewport = page.getViewport({ scale: dpi / PDF_BASE_DPI });

    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext("2d");
    // @napi-rs/canvas non è un <canvas> DOM: i tipi di pdfjs-dist si aspettano
    // quello, ma a runtime l'interfaccia usata (getContext/render) è compatibile.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await page.render({ canvas: canvas as any, canvasContext: context as any, viewport }).promise;

    return canvas.toBuffer("image/png");
  } finally {
    doc.cleanup();
  }
}

/**
 * Rasterizza solo una fascia della pagina: l'intestazione (numeri di giorno)
 * piu' la riga del dipendente cercato (con un margine sopra/sotto), unite in
 * un'unica immagine piu' piccola — invece dell'intera pagina. Le coordinate
 * (in punti pdf) arrivano da `findStaffPage.findStaffRowBand`. Stesso
 * percorso Azure delle foto/della pagina intera, cambia solo cosa c'e'
 * dentro l'immagine: una tabella piu' piccola e semplice ha piu'
 * probabilita' di essere letta correttamente.
 */
export async function rasterizeStaffRowBand(
  buffer: Buffer,
  pageIndex: number,
  band: StaffRowBand,
  dpi: number = DEFAULT_DPI,
): Promise<Buffer> {
  const doc = await getDocument({ data: new Uint8Array(buffer) }).promise;
  try {
    const page = await doc.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale: dpi / PDF_BASE_DPI });

    const fullCanvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const fullContext = fullCanvas.getContext("2d");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await page.render({ canvas: fullCanvas as any, canvasContext: fullContext as any, viewport }).promise;

    const toPixelY = (pdfY: number) => viewport.convertToViewportPoint(0, pdfY)[1];

    const headerHeight = clamp(Math.round(toPixelY(band.headerBottomPdfY) + HEADER_MARGIN_PX), 1, fullCanvas.height);
    const rowTop = clamp(Math.round(toPixelY(band.rowTopPdfY)), 0, fullCanvas.height);
    const rowBottom = clamp(Math.round(toPixelY(band.rowBottomPdfY) + ROW_MARGIN_PX), rowTop + 1, fullCanvas.height);
    const rowHeight = rowBottom - rowTop;

    const composite = createCanvas(fullCanvas.width, headerHeight + BAND_GAP_PX + rowHeight);
    const context = composite.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, composite.width, composite.height);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context.drawImage(fullCanvas as any, 0, 0, fullCanvas.width, headerHeight, 0, 0, fullCanvas.width, headerHeight);
    context.drawImage(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fullCanvas as any,
      0,
      rowTop,
      fullCanvas.width,
      rowHeight,
      0,
      headerHeight + BAND_GAP_PX,
      fullCanvas.width,
      rowHeight,
    );

    return composite.toBuffer("image/png");
  } finally {
    doc.cleanup();
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Rasterizza tutte le pagine del PDF: rete di sicurezza finale quando non si sa quale pagina serve. */
export async function rasterizeAllPages(buffer: Buffer, dpi: number = DEFAULT_DPI): Promise<Buffer[]> {
  const totalPages = await countPdfPages(buffer);
  const pages: Buffer[] = [];
  for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
    pages.push(await rasterizePage(buffer, pageIndex, dpi));
  }
  return pages;
}

/**
 * Copia una singola pagina in un nuovo PDF di una pagina sola, cosi' il
 * "tentativo diretto" (invio nativo ad Azure, senza rasterizzare) lavora su
 * un documento piccolo e mirato invece che sull'intera turnistica.
 */
export async function extractSinglePagePdf(buffer: Buffer, pageIndex: number): Promise<Buffer> {
  const source = await PDFDocument.load(buffer);
  const output = await PDFDocument.create();
  const [copiedPage] = await output.copyPages(source, [pageIndex]);
  output.addPage(copiedPage);
  return Buffer.from(await output.save());
}
