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

// ---------------------------------------------------------------------------
// Individuare la posizione (non solo la pagina) della riga del dipendente e
// dell'intestazione, per poter ritagliare solo quella fascia della pagina
// invece di rasterizzarla intera (vedi pdfRasterizer.ts / rasterizeStaffRowBand).
// ---------------------------------------------------------------------------

const Y_TOLERANCE_PTS = 3; // righe la cui y differisce meno di cosi' vengono considerate la stessa riga
const MIN_DAY_SEQUENCE_RUN = 5; // stesso criterio/valore di MIN_DAY_SEQUENCE_RUN in shiftGridParser.ts
const ROWS_ABOVE_BELOW = 2; // quante righe di dati includere sopra/sotto quella del dipendente
const DAY_NUMBER_RE = /^\d{1,2}$/;

/**
 * Quanto e' lunga la sequenza piu' lunga di numeri 1-31 consecutivi
 * crescenti fra i token della riga (nell'ordine da sinistra a destra,
 * ignorando i token non numerici in mezzo, es. "Sa"/"So"). Stesso criterio
 * di `findDayAxis` in shiftGridParser.ts: una riga di turni puo' benissimo
 * contenere tanti codici che SEMBRANO numeri di giorno (tanti turni sono
 * numeri singoli tipo "1", "2", "3"), ma i loro valori non sono quasi mai in
 * ordine crescente come lo sono davvero i giorni del mese in un'intestazione.
 */
function longestConsecutiveDayRun(tokens: string[]): number {
  let longestRun = 0;
  let currentRun = 0;
  let previous: number | null = null;

  for (const token of tokens) {
    if (!DAY_NUMBER_RE.test(token)) continue;
    const value = Number(token);
    if (value < 1 || value > 31) continue;

    currentRun = previous !== null && value === previous + 1 ? currentRun + 1 : 1;
    previous = value;
    longestRun = Math.max(longestRun, currentRun);
  }

  return longestRun;
}

interface PdfTextItem {
  text: string;
  x: number;
  y: number;
}

interface PdfLine {
  y: number;
  items: PdfTextItem[];
  text: string;
}

/** Raggruppa gli elementi di testo di una pagina in "righe" per coordinata y (origine pdf: in basso, y cresce verso l'alto). */
function groupLinesByY(rawItems: PdfTextItem[]): PdfLine[] {
  const sorted = [...rawItems].sort((a, b) => b.y - a.y);
  const lines: PdfLine[] = [];

  for (const item of sorted) {
    const existing = lines.find((line) => Math.abs(line.y - item.y) <= Y_TOLERANCE_PTS);
    if (existing) existing.items.push(item);
    else lines.push({ y: item.y, items: [item], text: "" });
  }

  for (const line of lines) {
    line.items.sort((a, b) => a.x - b.x);
    line.text = line.items.map((i) => i.text).join(" ");
  }

  return lines;
}

export interface StaffRowBand {
  /** Fondo, in punti pdf, dell'ultima riga di intestazione (numeri di giorno): tutto quello sopra va incluso nel ritaglio. */
  headerBottomPdfY: number;
  /** Estremi, in punti pdf, della fascia che contiene la riga del dipendente e un paio di righe sopra/sotto. */
  rowTopPdfY: number;
  rowBottomPdfY: number;
}

/**
 * Trova, dentro una pagina gia' identificata da findStaffPage, le coordinate
 * dell'intestazione (i numeri di giorno) e della riga del dipendente cercato,
 * con un margine di un paio di righe sopra/sotto. Serve a rasterizzare solo
 * una piccola fascia della pagina invece dell'intera tabella (vedi
 * pdfRasterizer.ts): un'immagine piu' piccola e semplice ha piu' probabilita'
 * di essere segmentata correttamente da Azure rispetto a una tabella intera
 * con decine di righe — specialmente perche' su documenti densi/colorati
 * abbiamo visto Azure fallire completamente (0% di copertura) sull'immagine
 * a pagina intera.
 *
 * Il ritaglio non deve essere preciso: qualche riga di troppo o tagliata a
 * meta' sopra/sotto non e' un problema, l'unica cosa che conta e' includere
 * per intero l'intestazione e la riga del dipendente.
 *
 * Restituisce null se non si riesce a individuare con sicurezza sia la riga
 * del nome sia una riga di intestazione con abbastanza numeri di giorno: chi
 * chiama deve trattarlo come "ritaglio non riuscito" e rasterizzare l'intera
 * pagina come rete di sicurezza, mai una regressione rispetto a oggi.
 */
export async function findStaffRowBand(
  buffer: Buffer,
  pageIndex: number,
  staffName: string | undefined,
): Promise<StaffRowBand | null> {
  if (!staffName?.trim()) return null;

  const doc = await getDocument({ data: new Uint8Array(buffer) }).promise;
  try {
    const page = await doc.getPage(pageIndex + 1);
    const content = await page.getTextContent();
    const rawItems: PdfTextItem[] = content.items
      .filter((item): item is typeof item & { str: string; transform: number[] } => "str" in item && item.str.trim().length > 0)
      .map((item) => ({ text: item.str, x: item.transform[4], y: item.transform[5] }));

    const lines = groupLinesByY(rawItems);

    let nameLine: PdfLine | null = null;
    let nameScore = 0;
    for (const line of lines) {
      const score = nameMatchScore(line.text, staffName);
      if (score > nameScore) {
        nameScore = score;
        nameLine = line;
      }
    }
    if (!nameLine || nameScore < MIN_PAGE_MATCH_SCORE) return null;

    // Le righe di intestazione sono sempre sopra la riga dati: si scartano
    // eventuali righe piu' in basso (una riga di turni puo' benissimo avere
    // 5+ codici che sembrano numeri di giorno, es. "1", "2", "3"). Si
    // guardano i singoli TOKEN del testo della riga (non gli elementi pdf
    // grezzi): a seconda di come il PDF e' stato generato, pdfjs a volte
    // unisce piu' numeri vicini in un solo elemento (con spazi dentro)
    // invece di tenerli separati — cosi' funziona in entrambi i casi.
    const headerLines = lines.filter((line) => {
      if (line.y <= nameLine.y) return false;
      return longestConsecutiveDayRun(line.text.split(/\s+/)) >= MIN_DAY_SEQUENCE_RUN;
    });
    if (headerLines.length === 0) return null;

    const headerBottomPdfY = Math.min(...headerLines.map((line) => line.y));

    // Altezza di riga stimata dalla mediana degli scarti fra le righe nella
    // zona dati (sotto l'intestazione): serve a stimare quanto "un paio di
    // righe sopra/sotto" siano, senza doverle contare una per una — il che
    // sarebbe fragile con le righe di annotazione secondarie che spesso
    // spezzano una riga dati in piu' sotto-righe.
    const dataLines = lines.filter((line) => line.y < headerBottomPdfY);
    const gaps: number[] = [];
    for (let i = 1; i < dataLines.length; i++) gaps.push(dataLines[i - 1].y - dataLines[i].y);
    gaps.sort((a, b) => a - b);
    const rowHeight = gaps.length > 0 ? gaps[Math.floor(gaps.length / 2)] : 15;

    const margin = (ROWS_ABOVE_BELOW + 1.5) * rowHeight;
    // La fascia riga non deve mai risalire fin dentro l'intestazione (puo'
    // succedere col nome vicino alla cima della tabella, o con poche righe
    // di dati totali): il margine sopra si ferma appena sotto il fondo
    // dell'intestazione, cosi' le due fasce restano distinte.
    const rowTopPdfY = Math.min(nameLine.y + margin, headerBottomPdfY - 1);
    return {
      headerBottomPdfY,
      rowTopPdfY,
      rowBottomPdfY: nameLine.y - margin,
    };
  } finally {
    doc.cleanup();
  }
}
