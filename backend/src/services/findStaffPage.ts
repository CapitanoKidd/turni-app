import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { nameMatchScore } from "./shiftGridParser.js";

const MIN_PAGE_MATCH_SCORE = 0.5;

export interface StaffPageMatch {
  /** Indice di pagina 0-based, cosi' si passa direttamente a pdf-lib/pdfRasterizer. */
  pageIndex: number;
  score: number;
}

/** Il miglior punteggio di corrispondenza nome scorrendo una finestra di parole alla volta nel testo della pagina. */
function bestNameScoreInText(text: string, staffName: string): number {
  const words = text.split(/\s+/).filter(Boolean);
  const targetWordCount = staffName.trim().split(/\s+/).filter(Boolean).length;
  const windowSize = Math.max(targetWordCount + 1, 2);

  let best = 0;
  for (let i = 0; i < words.length; i++) {
    const window = words.slice(i, i + windowSize).join(" ");
    const score = nameMatchScore(window, staffName);
    if (score > best) best = score;
  }
  return best;
}

/**
 * Cerca, usando solo il testo incorporato nel PDF (nessuna chiamata Azure,
 * gratis), in quale pagina compare il nome dell'utente. Utile per i
 * documenti multi-pagina (una turnistica di reparto su piu' pagine): invece
 * di mandare l'intero documento ad Azure, si isola e si invia solo la
 * pagina che serve davvero.
 *
 * Restituisce null se il PDF non ha testo estraibile (es. scansione pura)
 * o se nessuna pagina supera la soglia di confidenza: in quel caso chi
 * chiama deve trattare l'intero documento come rete di sicurezza, esattamente
 * come si faceva prima che questa funzione esistesse.
 */
export async function findStaffPage(buffer: Buffer, staffName: string | undefined): Promise<StaffPageMatch | null> {
  if (!staffName?.trim()) return null;

  const doc = await getDocument({ data: new Uint8Array(buffer) }).promise;
  try {
    let best: StaffPageMatch | null = null;

    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
      if (!text.trim()) continue; // niente testo su questa pagina (probabile scansione)

      const score = bestNameScoreInText(text, staffName);
      if (score >= MIN_PAGE_MATCH_SCORE && (!best || score > best.score)) {
        best = { pageIndex: pageNumber - 1, score };
      }
    }

    return best;
  } finally {
    doc.cleanup();
  }
}
