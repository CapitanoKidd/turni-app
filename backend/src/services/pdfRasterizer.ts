import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";
import { PDFDocument } from "pdf-lib";

const DEFAULT_DPI = 300;
const PDF_BASE_DPI = 72; // un "punto" PDF corrisponde a 1/72 di pollice

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
