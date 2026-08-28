import { PDFDocument, StandardFonts } from "pdf-lib";

export interface TestPdfPage {
  /**
   * Righe di testo da disegnare sulla pagina, dall'alto in basso. Una
   * stringa = un'unica riga (un solo elemento di testo pdf, comodo per
   * i test semplici). Un array di stringhe = piu' token separati sulla
   * stessa riga, ognuno un elemento di testo pdf indipendente: serve per
   * simulare intestazioni con i numeri di giorno come celle separate
   * (es. ["01", "02", "03", ...]), come li restituisce davvero un PDF
   * vettoriale con una tabella.
   */
  lines?: Array<string | string[]>;
}

/** Crea un PDF sintetico in memoria per i test, senza nessun dato reale/personale. */
export async function makeTestPdf(pages: TestPdfPage[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (const pageSpec of pages) {
    const page = doc.addPage([600, 400]);
    let y = 370;
    for (const line of pageSpec.lines ?? []) {
      if (Array.isArray(line)) {
        let x = 20;
        for (const token of line) {
          page.drawText(token, { x, y, size: 12, font });
          x += 18;
        }
      } else {
        page.drawText(line, { x: 20, y, size: 12, font });
      }
      y -= 20;
    }
  }

  return Buffer.from(await doc.save());
}
