import {
  buildFingerprintsByRow,
  extractPdfGridGeometry,
  extractPlacedCellImages,
  type RowFingerprints,
} from "./cellImageIdentity.js";
import type { ExtractedTable } from "./ocr/types.js";
import { extractRosterGrid, nameMatchScore, normalizeName, type DetectedShift } from "./shiftGridParser.js";

const MIN_NAME_MATCH = 0.5;

export interface CellImageFillResult {
  detectedShifts: DetectedShift[];
  debug: string[];
  /**
   * I giorni rimasti senza codice perche' il loro disegno non e' stato letto
   * in nessun punto del documento: da far definire una volta all'utente.
   * L'app li ricorda per impronta, cosi' il mese dopo sono gia' noti.
   */
  unresolved: Array<{ date: string; fingerprint: string }>;
  /**
   * Cosa abbiamo imparato in questo documento: impronta -> codice. L'app la
   * conserva sul telefono e la rispedisce al caricamento successivo, cosi' la
   * conoscenza si accumula nel tempo invece di ripartire da zero ogni volta.
   */
  learned: Record<string, string>;
}

interface FillInput {
  buffer: Buffer;
  pageIndex: number;
  tables: ExtractedTable[];
  target: { year: number; month1To12: number };
  staffName: string;
  detectedShifts: DetectedShift[];
  /**
   * Impronte gia' note dai caricamenti precedenti (memoria dell'app). Hanno
   * la precedenza sulla legenda dedotta qui: sono state confermate
   * dall'utente, mentre quella dedotta viene da una lettura automatica che
   * puo' sbagliare.
   */
  knownCodesByFingerprint?: Record<string, string>;
}

/**
 * Completa i giorni che l'analisi ha lasciato vuoti sfruttando il fatto che
 * le celle sono disegni riutilizzati: se lo stesso disegno e' stato letto
 * correttamente da qualche altra parte nel documento (nella riga dell'utente
 * o in quella di un collega), il suo significato vale anche qui.
 *
 * Non e' una stima: due celle con la stessa impronta contengono gli stessi
 * identici pixel. Sul documento reale di prova, un giorno rimasto vuoto e uno
 * letto correttamente contenevano lo stesso identico oggetto immagine.
 *
 * Non fa nessuna chiamata al servizio di analisi: lavora sul PDF che abbiamo
 * gia'. Se il documento non ha questa struttura (celle vettoriali, foto,
 * niente griglia riconoscibile) restituisce i turni immutati.
 */
export async function fillGapsFromCellImages(input: FillInput): Promise<CellImageFillResult> {
  const { buffer, pageIndex, tables, target, staffName, detectedShifts, knownCodesByFingerprint } = input;
  const unchanged: CellImageFillResult = { detectedShifts, debug: [], unresolved: [], learned: {} };

  const totalDays = new Date(target.year, target.month1To12, 0).getDate();
  const missingDays = findMissingDays(detectedShifts, target, totalDays);
  if (missingDays.length === 0) return unchanged;

  let geometry;
  let images;
  try {
    geometry = await extractPdfGridGeometry(buffer, pageIndex);
    if (!geometry) return { ...unchanged, debug: ["recupero da disegni: la pagina non ha una griglia riconoscibile"] };
    images = await extractPlacedCellImages(buffer, pageIndex);
  } catch {
    // Un PDF illeggibile a questo livello non deve far fallire l'analisi:
    // si restituisce quanto gia' ottenuto dall'OCR.
    return { ...unchanged, debug: ["recupero da disegni: non riuscito a leggere la struttura del PDF"] };
  }

  if (images.length === 0) {
    return { ...unchanged, debug: ["recupero da disegni: nessuna cella disegnata (i codici sono testo o vettoriali)"] };
  }

  const fingerprintsByRow = buildFingerprintsByRow(geometry, images);
  const grid = extractRosterGrid(tables, target);
  if (grid.length === 0) return { ...unchanged, debug: ["recupero da disegni: nessuna turnistica riconosciuta"] };

  const documentLegend = buildLegend(grid, fingerprintsByRow);
  // Cio' che l'utente ha gia' confermato in passato prevale su cio' che
  // deduciamo ora da una lettura automatica.
  const legend = new Map(documentLegend);
  for (const [fingerprint, code] of Object.entries(knownCodesByFingerprint ?? {})) {
    legend.set(fingerprint, code);
  }
  const ownFingerprints = findRowFingerprints(fingerprintsByRow, staffName);

  const learned = Object.fromEntries(documentLegend);
  const knownCount = Object.keys(knownCodesByFingerprint ?? {}).length;
  const debug = [
    `recupero da disegni: ${images.length} celle disegnate, ${new Set(images.map((i) => i.fingerprint)).size} disegni distinti`,
    `legenda imparata dalle letture riuscite: ${documentLegend.size} disegni riconosciuti` +
      (knownCount > 0 ? ` + ${knownCount} gia' noti dai caricamenti precedenti` : ""),
  ];

  if (!ownFingerprints) {
    debug.push(`recupero da disegni: riga di "${staffName}" non individuata nella pagina`);
    return { ...unchanged, debug, learned };
  }

  const recovered: DetectedShift[] = [];
  const unresolved: CellImageFillResult["unresolved"] = [];

  for (const day of missingDays) {
    const fingerprint = ownFingerprints.get(day);
    if (!fingerprint) continue;

    const code = legend.get(fingerprint);
    const date = toIsoDate(target, day);
    if (code) {
      // Confidenza inferiore a una lettura diretta: e' un recupero per
      // identita' del disegno, corretto ma derivato.
      recovered.push({ date, rawCode: code, confidence: 0.8 });
    } else {
      unresolved.push({ date, fingerprint });
    }
  }

  debug.push(
    `giorni recuperati per identita' del disegno: ${recovered.length}` +
      (unresolved.length > 0 ? ` — ${unresolved.length} disegni mai letti in tutta la pagina, da definire a mano` : ""),
  );

  const merged = [...detectedShifts, ...recovered].sort((a, b) => a.date.localeCompare(b.date));
  return { detectedShifts: merged, debug, unresolved, learned };
}

/**
 * Cosa significa ogni disegno, imparato dalle celle che l'analisi HA letto,
 * su tutte le righe della pagina. Se lo stesso disegno risulta letto in modi
 * diversi (errore di lettura da qualche parte) vince la lettura piu'
 * frequente.
 */
function buildLegend(
  grid: ReturnType<typeof extractRosterGrid>,
  fingerprintsByRow: Map<string, RowFingerprints>,
): Map<string, string> {
  const votes = new Map<string, Map<string, number>>();

  for (const row of grid) {
    const rowFingerprints = findRowFingerprints(fingerprintsByRow, row.name);
    if (!rowFingerprints) continue;

    for (const [day, code] of row.codesByDay) {
      const fingerprint = rowFingerprints.get(day);
      if (!fingerprint) continue;
      const byCode = votes.get(fingerprint) ?? new Map<string, number>();
      byCode.set(code, (byCode.get(code) ?? 0) + 1);
      votes.set(fingerprint, byCode);
    }
  }

  const legend = new Map<string, string>();
  for (const [fingerprint, byCode] of votes) {
    const [bestCode] = [...byCode.entries()].sort((a, b) => b[1] - a[1])[0];
    legend.set(fingerprint, bestCode);
  }
  return legend;
}

/** Le impronte della riga di una persona: i nomi letti dall'analisi e quelli letti dal PDF possono differire leggermente, quindi si abbinano per somiglianza. */
function findRowFingerprints(
  fingerprintsByRow: Map<string, RowFingerprints>,
  name: string,
): RowFingerprints | null {
  const normalized = normalizeName(name);
  for (const [candidate, fingerprints] of fingerprintsByRow) {
    if (normalizeName(candidate) === normalized) return fingerprints;
  }

  let best: RowFingerprints | null = null;
  let bestScore = 0;
  for (const [candidate, fingerprints] of fingerprintsByRow) {
    const score = nameMatchScore(candidate, name);
    if (score > bestScore) {
      bestScore = score;
      best = fingerprints;
    }
  }
  return bestScore >= MIN_NAME_MATCH ? best : null;
}

function findMissingDays(shifts: DetectedShift[], target: FillInput["target"], totalDays: number): number[] {
  const present = new Set(shifts.filter((s) => s.rawCode.trim().length > 0).map((s) => s.date));
  const missing: number[] = [];
  for (let day = 1; day <= totalDays; day++) {
    if (!present.has(toIsoDate(target, day))) missing.push(day);
  }
  return missing;
}

function toIsoDate(target: FillInput["target"], day: number): string {
  return `${target.year}-${String(target.month1To12).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
