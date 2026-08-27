import { PDFDocument, StandardFonts } from "pdf-lib";

export interface TestPdfPage {
  /** Righe di testo da disegnare sulla pagina; nessuna riga = pagina senza testo (simula una scansione). */
  lines?: string[];
}

/** Crea un PDF sintetico in memoria per i test, senza nessun dato reale/personale. */
export async function makeTestPdf(pages: TestPdfPage[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (const pageSpec of pages) {
    const page = doc.addPage([300, 400]);
    let y = 370;
    for (const line of pageSpec.lines ?? []) {
      page.drawText(line, { x: 20, y, size: 12, font });
      y -= 20;
    }
  }

  return Buffer.from(await doc.save());
}
