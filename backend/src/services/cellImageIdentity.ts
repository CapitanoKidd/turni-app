import { createHash } from "node:crypto";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";

/**
 * Molti generatori di turnistiche (es. POLYPOINT/PEP) non scrivono i codici
 * turno come testo: disegnano in ogni cella una piccola immagine, e la stessa
 * immagine viene riutilizzata ovunque quel codice compare. Su un documento
 * reale: 721 celle disegnate ma solo 85 immagini distinte.
 *
 * Questo modulo sfrutta quel fatto. Se l'OCR legge "-" in una cella, e la
 * cella rimasta vuota contiene ESATTAMENTE la stessa immagine, allora anche
 * quella e' "-": non e' una stima, sono gli stessi pixel. E' il rimedio alla
 * sola causa realmente misurata dei giorni mancanti, cioe' l'instabilita'
 * dell'OCR su simboli minuscoli (24x24 pixel): sullo stesso documento Azure
 * legge una cella e ne salta un'altra identica.
 *
 * Tutto avviene in locale, sul PDF che abbiamo gia': nessuna chiamata in piu'
 * al servizio di analisi.
 */

const Y_TOLERANCE_PTS = 3;
const MIN_DAY_SEQUENCE_RUN = 5; // stesso criterio di shiftGridParser.findDayAxis
const DAY_NUMBER_RE = /^\d{1,2}$/;

/** Una cella disegnata come immagine, con la sua impronta e la posizione sulla pagina. */
export interface PlacedCellImage {
  /**
   * Impronta dei pixel. Due celle con la stessa impronta contengono lo stesso
   * identico disegno, anche se appartengono a documenti (o mesi) diversi:
   * questo permette di ricordare il significato di un simbolo nel tempo.
   */
  fingerprint: string;
  x: number;
  y: number;
}

/** Geometria della griglia ricavata dal testo del PDF: dove sono i giorni e dove sono le righe delle persone. */
export interface PdfGridGeometry {
  /** giorno del mese -> coordinata x della sua colonna */
  dayColumnX: Map<number, number>;
  /** nome della persona -> coordinata y della sua riga */
  rowY: Map<string, number>;
  /** altezza tipica di una riga, per capire quali immagini appartengono a quale riga */
  rowHeight: number;
}

/** Come sono composte le celle di una persona: giorno -> impronta dell'immagine disegnata li'. */
export type RowFingerprints = Map<number, string>;

interface TextItem {
  text: string;
  x: number;
  y: number;
}

function multiply(m: number[], n: number[]): number[] {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

/** La sequenza piu' lunga di numeri 1-31 consecutivi crescenti fra i token: distingue l'intestazione dei giorni da una riga di turni piena di codici numerici. */
function longestConsecutiveDayRun(tokens: string[]): number {
  let longest = 0;
  let current = 0;
  let previous: number | null = null;
  for (const token of tokens) {
    if (!DAY_NUMBER_RE.test(token)) continue;
    const value = Number(token);
    if (value < 1 || value > 31) continue;
    current = previous !== null && value === previous + 1 ? current + 1 : 1;
    previous = value;
    longest = Math.max(longest, current);
  }
  return longest;
}

function groupByY(items: TextItem[]): Map<number, TextItem[]> {
  const rows = new Map<number, TextItem[]>();
  for (const item of items) {
    let key: number | null = null;
    for (const existing of rows.keys()) {
      if (Math.abs(existing - item.y) <= Y_TOLERANCE_PTS) {
        key = existing;
        break;
      }
    }
    if (key === null) rows.set(item.y, [item]);
    else rows.get(key)?.push(item);
  }
  return rows;
}

/**
 * Ricava dal testo del PDF dove si trovano le colonne dei giorni e le righe
 * delle persone. Restituisce null se la pagina non ha una griglia
 * riconoscibile (es. un PDF di tutt'altro tipo): in quel caso chi chiama non
 * applica nessun recupero e tutto resta come prima.
 */
export async function extractPdfGridGeometry(buffer: Buffer, pageIndex: number): Promise<PdfGridGeometry | null> {
  const doc = await getDocument({ data: new Uint8Array(buffer) }).promise;
  try {
    const page = await doc.getPage(pageIndex + 1);
    const content = await page.getTextContent();
    const items: TextItem[] = content.items
      .filter((i): i is typeof i & { str: string; transform: number[] } => "str" in i && i.str.trim().length > 0)
      .map((i) => ({ text: i.str.trim(), x: i.transform[4], y: i.transform[5] }));

    const byY = groupByY(items);

    // Riga di intestazione: quella con la sequenza di giorni consecutivi piu' lunga.
    let headerY: number | null = null;
    let headerRun = 0;
    for (const [y, rowItems] of byY) {
      const tokens = rowItems.sort((a, b) => a.x - b.x).flatMap((i) => i.text.split(/\s+/));
      const run = longestConsecutiveDayRun(tokens);
      if (run >= MIN_DAY_SEQUENCE_RUN && run > headerRun) {
        headerRun = run;
        headerY = y;
      }
    }
    if (headerY === null) return null;

    const dayColumnX = new Map<number, number>();
    for (const item of byY.get(headerY) ?? []) {
      if (!DAY_NUMBER_RE.test(item.text)) continue;
      const day = Number(item.text);
      if (day >= 1 && day <= 31 && !dayColumnX.has(day)) dayColumnX.set(day, item.x);
    }
    if (dayColumnX.size < MIN_DAY_SEQUENCE_RUN) return null;

    // Le righe delle persone stanno sotto l'intestazione, a sinistra della prima colonna-giorno.
    const firstDayX = Math.min(...dayColumnX.values());
    const rowY = new Map<string, number>();
    for (const [y, rowItems] of byY) {
      if (y >= headerY) continue;
      const label = rowItems
        .filter((i) => i.x < firstDayX - 5)
        .sort((a, b) => a.x - b.x)
        .map((i) => i.text)
        .join(" ")
        .trim();
      // Un nome ha lettere e una lunghezza minima: scarta numeri e simboli sparsi.
      if (label.length < 4) continue;
      const letters = (label.match(/[A-Za-zÀ-ÿ]/g) ?? []).length;
      if (letters < 3 || letters / label.length < 0.5) continue;
      if (!rowY.has(label)) rowY.set(label, y);
    }
    if (rowY.size === 0) return null;

    const sortedRowY = [...rowY.values()].sort((a, b) => b - a);
    const gaps: number[] = [];
    for (let i = 1; i < sortedRowY.length; i++) gaps.push(sortedRowY[i - 1] - sortedRowY[i]);
    gaps.sort((a, b) => a - b);
    const rowHeight = gaps.length > 0 ? gaps[Math.floor(gaps.length / 2)] : 15;

    return { dayColumnX, rowY, rowHeight };
  } finally {
    doc.cleanup();
  }
}

/**
 * Elenca tutte le celle disegnate come immagine sulla pagina, con l'impronta
 * dei loro pixel e la posizione. Un'impronta identica = disegno identico.
 */
export async function extractPlacedCellImages(buffer: Buffer, pageIndex: number): Promise<PlacedCellImage[]> {
  const doc = await getDocument({ data: new Uint8Array(buffer) }).promise;
  try {
    const page = await doc.getPage(pageIndex + 1);
    const ops = await page.getOperatorList();

    let ctm = [1, 0, 0, 1, 0, 0];
    const stack: number[][] = [];
    const placements: Array<{ objectId: string; x: number; y: number }> = [];

    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i];
      const args = ops.argsArray[i] as unknown[];
      if (fn === OPS.save) stack.push([...ctm]);
      else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
      else if (fn === OPS.transform) ctm = multiply(ctm, args as number[]);
      else if (fn === OPS.paintImageXObject) {
        placements.push({ objectId: String(args[0]), x: ctm[4], y: ctm[5] });
      }
    }

    // L'impronta si calcola una volta per oggetto, non per cella: gli oggetti
    // distinti sono pochi (decine) mentre le celle disegnate sono centinaia.
    const fingerprintByObjectId = new Map<string, string>();
    for (const objectId of new Set(placements.map((p) => p.objectId))) {
      fingerprintByObjectId.set(objectId, await fingerprintOfImage(page, objectId));
    }

    return placements.map((p) => ({
      fingerprint: fingerprintByObjectId.get(p.objectId) ?? p.objectId,
      x: p.x,
      y: p.y,
    }));
  } finally {
    doc.cleanup();
  }
}

/**
 * Impronta dei pixel di un'immagine. Se i pixel non sono raggiungibili si
 * ripiega sull'identificativo interno: resta valido dentro lo stesso
 * documento (che e' quanto serve per riempire i buchi), ma non fra documenti
 * diversi.
 */
async function fingerprintOfImage(
  page: { objs: { get(id: string, callback: (value: unknown) => void): void } },
  objectId: string,
): Promise<string> {
  try {
    const image = await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout")), 3000);
      try {
        page.objs.get(objectId, (value) => {
          clearTimeout(timer);
          resolve(value);
        });
      } catch (error) {
        clearTimeout(timer);
        reject(error);
      }
    });

    const data = (image as { data?: ArrayLike<number> })?.data;
    const width = (image as { width?: number })?.width;
    const height = (image as { height?: number })?.height;
    if (!data || !width || !height) return objectId;

    const hash = createHash("sha1");
    hash.update(`${width}x${height}:`);
    hash.update(Buffer.from(Uint8Array.from(data as ArrayLike<number>)));
    return `px_${hash.digest("hex").slice(0, 16)}`;
  } catch {
    return objectId;
  }
}

/**
 * Per ogni persona e per ogni giorno, l'impronta dell'immagine disegnata in
 * quella cella. E' la mappa che permette di dire "questa cella vuota contiene
 * lo stesso disegno di quella che l'OCR ha letto".
 */
export function buildFingerprintsByRow(
  geometry: PdfGridGeometry,
  images: PlacedCellImage[],
): Map<string, RowFingerprints> {
  const columnTolerance = estimateColumnTolerance(geometry);
  const rowTolerance = Math.max(geometry.rowHeight * 0.6, 4);

  const result = new Map<string, RowFingerprints>();
  for (const [name, y] of geometry.rowY) {
    const inRow = images.filter((img) => Math.abs(img.y - y) <= rowTolerance);
    if (inRow.length === 0) continue;

    const byDay: RowFingerprints = new Map();
    for (const [day, x] of geometry.dayColumnX) {
      const hit = inRow.find((img) => Math.abs(img.x - x) <= columnTolerance);
      if (hit) byDay.set(day, hit.fingerprint);
    }
    if (byDay.size > 0) result.set(name, byDay);
  }
  return result;
}

/** Meta' del passo fra due colonne: cosi' ogni immagine finisce nella colonna piu' vicina senza sconfinare. */
function estimateColumnTolerance(geometry: PdfGridGeometry): number {
  const xs = [...geometry.dayColumnX.values()].sort((a, b) => a - b);
  const steps: number[] = [];
  for (let i = 1; i < xs.length; i++) steps.push(xs[i] - xs[i - 1]);
  steps.sort((a, b) => a - b);
  const step = steps.length > 0 ? steps[Math.floor(steps.length / 2)] : 16;
  return Math.max(step / 2, 4);
}
