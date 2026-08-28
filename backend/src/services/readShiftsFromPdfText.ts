import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractPdfGridGeometry, type PdfGridGeometry } from "./cellImageIdentity.js";
import { nameMatchScore, normalizeName, type DetectedShift } from "./shiftGridParser.js";

/**
 * Alcune turnistiche in PDF hanno i codici turno scritti come TESTO vero
 * dentro il file. In quel caso non serve nessun servizio di analisi esterno:
 * i turni si leggono qui, gratis e in modo esatto.
 *
 * Vale la pena provarci sempre prima di spendere una chiamata: se il
 * documento e' di quelli che disegnano le celle come immagini (vedi
 * cellImageIdentity.ts) qui non si trova nulla e si prosegue normalmente.
 */

const MIN_NAME_MATCH = 0.5;
/**
 * Quota minima di giorni con testo per fidarsi della lettura diretta. Il
 * confine e' netto nella pratica: un documento "testuale" arriva vicino al
 * 100%, uno che disegna le celle sta a 0%. Una soglia a meta' evita di
 * scambiare per turni qualche testo sparso finito per caso nella griglia.
 */
const MIN_TEXT_COVERAGE = 0.5;

export interface PdfTextReadResult {
  detectedShifts: DetectedShift[];
  /** Quota di giorni del mese letti direttamente dal testo (0-1). */
  coverage: number;
}

interface TextCell {
  text: string;
  x: number;
  y: number;
}

/**
 * Prova a leggere i turni della persona direttamente dal testo del PDF.
 * Restituisce null se il documento non ha i codici come testo (o se la riga
 * della persona non e' individuabile): in quel caso chi chiama deve
 * proseguire con l'analisi a pagamento, esattamente come prima.
 */
export async function readShiftsFromPdfText(
  buffer: Buffer,
  pageIndex: number,
  target: { year: number; month1To12: number },
  staffName: string | undefined,
): Promise<PdfTextReadResult | null> {
  if (!staffName?.trim()) return null;

  let geometry: PdfGridGeometry | null;
  try {
    geometry = await extractPdfGridGeometry(buffer, pageIndex);
  } catch {
    return null;
  }
  if (!geometry) return null;

  const rowY = findRowY(geometry, staffName);
  if (rowY === null) return null;

  const doc = await getDocument({ data: new Uint8Array(buffer) }).promise;
  try {
    const page = await doc.getPage(pageIndex + 1);
    const content = await page.getTextContent();
    const items: TextCell[] = content.items
      .filter((i): i is typeof i & { str: string; transform: number[] } => "str" in i && i.str.trim().length > 0)
      .map((i) => ({ text: i.str.trim(), x: i.transform[4], y: i.transform[5] }));

    const columnTolerance = estimateColumnTolerance(geometry);
    const rowTolerance = Math.max(geometry.rowHeight * 0.6, 4);
    const inRow = items.filter((i) => Math.abs(i.y - rowY) <= rowTolerance);

    const totalDays = new Date(target.year, target.month1To12, 0).getDate();
    const detectedShifts: DetectedShift[] = [];

    for (const [day, x] of geometry.dayColumnX) {
      if (day > totalDays) continue;
      const hit = inRow.find((i) => Math.abs(i.x - x) <= columnTolerance);
      if (!hit) continue;
      const code = hit.text.split(/\s+/)[0];
      if (!code) continue;
      detectedShifts.push({
        date: toIsoDate(target, day),
        rawCode: code.toUpperCase(),
        // Lettura esatta dal testo del documento: non c'e' nessun
        // riconoscimento visivo di mezzo, quindi la fiducia e' massima.
        confidence: 1,
      });
    }

    const coverage = detectedShifts.length / totalDays;
    if (coverage < MIN_TEXT_COVERAGE) return null;

    detectedShifts.sort((a, b) => a.date.localeCompare(b.date));
    return { detectedShifts, coverage };
  } finally {
    doc.cleanup();
  }
}

function findRowY(geometry: PdfGridGeometry, staffName: string): number | null {
  const normalized = normalizeName(staffName);
  for (const [candidate, y] of geometry.rowY) {
    if (normalizeName(candidate) === normalized) return y;
  }

  let bestY: number | null = null;
  let bestScore = 0;
  for (const [candidate, y] of geometry.rowY) {
    const score = nameMatchScore(candidate, staffName);
    if (score > bestScore) {
      bestScore = score;
      bestY = y;
    }
  }
  return bestScore >= MIN_NAME_MATCH ? bestY : null;
}

function estimateColumnTolerance(geometry: PdfGridGeometry): number {
  const xs = [...geometry.dayColumnX.values()].sort((a, b) => a - b);
  const steps: number[] = [];
  for (let i = 1; i < xs.length; i++) steps.push(xs[i] - xs[i - 1]);
  steps.sort((a, b) => a - b);
  const step = steps.length > 0 ? steps[Math.floor(steps.length / 2)] : 16;
  return Math.max(step / 2, 4);
}

function toIsoDate(target: { year: number; month1To12: number }, day: number): string {
  return `${target.year}-${String(target.month1To12).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
