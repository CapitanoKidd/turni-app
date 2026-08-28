import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createCanvas } from "@napi-rs/canvas";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { buildFingerprintsByRow, extractPdfGridGeometry, extractPlacedCellImages } from "../services/cellImageIdentity.js";
import { fillGapsFromCellImages } from "../services/fillGapsFromCellImages.js";
import type { ExtractedTable, TableCell } from "../services/ocr/types.js";

const DAYS = 10;
const DAY_X0 = 120;
const DAY_STEP = 24;
const HEADER_Y = 300;
const ROW_STEP = 30;

/** Disegno di una cella: piccola immagine, come fanno i veri generatori di turnistiche. */
function cellPng(label: string): Buffer {
  const canvas = createCanvas(24, 24);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#eeeeee";
  ctx.fillRect(0, 0, 24, 24);
  ctx.fillStyle = "#000000";
  ctx.font = "16px sans-serif";
  ctx.fillText(label, 5, 18);
  return canvas.toBuffer("image/png");
}

/**
 * Turnistica sintetica costruita come quelle vere: giorni e nomi come TESTO,
 * codici turno come IMMAGINI riutilizzate (lo stesso codice = la stessa
 * immagine, quindi la stessa impronta).
 */
async function makeRosterPdf(rows: Array<{ name: string; codes: string[] }>): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([420, 360]);

  for (let d = 1; d <= DAYS; d++) {
    page.drawText(String(d).padStart(2, "0"), { x: DAY_X0 + (d - 1) * DAY_STEP, y: HEADER_Y, size: 9, font });
  }

  // Una sola immagine per codice distinto: e' proprio il riuso che vogliamo verificare.
  const embedded = new Map<string, Awaited<ReturnType<typeof doc.embedPng>>>();
  for (const code of new Set(rows.flatMap((r) => r.codes))) {
    embedded.set(code, await doc.embedPng(cellPng(code)));
  }

  rows.forEach((row, i) => {
    const y = HEADER_Y - ROW_STEP * (i + 1);
    page.drawText(row.name, { x: 20, y, size: 9, font, color: rgb(0, 0, 0) });
    row.codes.forEach((code, d) => {
      page.drawImage(embedded.get(code)!, { x: DAY_X0 + d * DAY_STEP, y, width: 16, height: 16 });
    });
  });

  return Buffer.from(await doc.save());
}

/** Tabella "letta dall'OCR": si puo' chiedere di lasciare vuote alcune celle, come fa davvero un OCR che salta un simbolo. */
function ocrTable(rows: Array<{ name: string; codes: string[] }>, blanks: Record<string, number[]> = {}): ExtractedTable {
  const cells: TableCell[] = [];
  for (let d = 1; d <= DAYS; d++) cells.push({ rowIndex: 0, columnIndex: d, text: String(d) });
  rows.forEach((row, i) => {
    const rowIndex = i + 1;
    cells.push({ rowIndex, columnIndex: 0, text: row.name });
    row.codes.forEach((code, d) => {
      const skipped = (blanks[row.name] ?? []).includes(d + 1);
      cells.push({ rowIndex, columnIndex: d + 1, text: skipped ? "" : code });
    });
  });
  return { rowCount: rows.length + 1, columnCount: DAYS + 1, cells };
}

const TARGET = { year: 2026, month1To12: 8 };

describe("cellImageIdentity", () => {
  it("riconosce la geometria della griglia e da' la stessa impronta a celle con lo stesso disegno", async () => {
    const rows = [
      { name: "Mario Rossi", codes: ["M", "M", "P", "-", "-", "M", "P", "-", "M", "P"] },
      { name: "Anna Bianchi", codes: ["P", "P", "M", "M", "-", "-", "M", "M", "P", "-"] },
    ];
    const pdf = await makeRosterPdf(rows);

    const geometry = await extractPdfGridGeometry(pdf, 0);
    assert.ok(geometry, "doveva riconoscere la griglia");
    assert.equal(geometry.dayColumnX.size, DAYS);
    assert.ok(geometry.rowY.has("Mario Rossi"));

    const images = await extractPlacedCellImages(pdf, 0);
    assert.equal(images.length, DAYS * rows.length, "una immagine per cella");

    const byRow = buildFingerprintsByRow(geometry, images);
    const mario = byRow.get("Mario Rossi");
    assert.ok(mario);
    assert.equal(mario.size, DAYS);
    // giorni 1 e 2 sono entrambi "M": stesso disegno, stessa impronta.
    assert.equal(mario.get(1), mario.get(2), "celle con lo stesso codice devono avere la stessa impronta");
    assert.notEqual(mario.get(1), mario.get(3), "codici diversi devono avere impronte diverse");
    // Le impronte sono calcolate sui pixel, quindi valgono anche fra righe diverse.
    assert.equal(mario.get(3), byRow.get("Anna Bianchi")?.get(1), "lo stesso codice in righe diverse ha la stessa impronta");
  });
});

describe("fillGapsFromCellImages", () => {
  it("recupera i giorni che l'OCR ha saltato usando le celle identiche lette altrove", async () => {
    const rows = [
      { name: "Mario Rossi", codes: ["M", "M", "P", "-", "-", "M", "P", "-", "M", "P"] },
      { name: "Anna Bianchi", codes: ["P", "P", "M", "M", "-", "-", "M", "M", "P", "-"] },
    ];
    const pdf = await makeRosterPdf(rows);
    // L'OCR salta i giorni 2 ("M", letto altrove nella stessa riga) e 5 ("-").
    const table = ocrTable(rows, { "Mario Rossi": [2, 5] });

    const detectedShifts = rows[0].codes
      .map((code, i) => ({ date: `2026-08-${String(i + 1).padStart(2, "0")}`, rawCode: code, confidence: 0.85 }))
      .filter((_, i) => ![1, 4].includes(i));
    assert.equal(detectedShifts.length, DAYS - 2, "si parte con due giorni mancanti");

    const out = await fillGapsFromCellImages({
      buffer: pdf,
      pageIndex: 0,
      tables: [table],
      target: TARGET,
      staffName: "Mario Rossi",
      detectedShifts,
    });

    assert.equal(out.detectedShifts.length, DAYS, "entrambi i giorni mancanti devono essere recuperati");
    assert.equal(out.detectedShifts.find((s) => s.date === "2026-08-02")?.rawCode, "M");
    assert.equal(out.detectedShifts.find((s) => s.date === "2026-08-05")?.rawCode, "-");
    assert.deepEqual(out.unresolved, [], "nessun disegno deve restare sconosciuto");
  });

  it("segnala come 'da definire' i disegni che l'OCR non ha letto in nessun punto, senza inventare", async () => {
    // Il codice "X" compare solo nella riga di Mario, e l'OCR lo salta sempre:
    // non esiste nessuna lettura da cui imparare cosa significhi.
    const rows = [
      { name: "Mario Rossi", codes: ["M", "X", "M", "M", "M", "M", "M", "M", "M", "M"] },
      { name: "Anna Bianchi", codes: ["M", "M", "M", "M", "M", "M", "M", "M", "M", "M"] },
    ];
    const pdf = await makeRosterPdf(rows);
    const table = ocrTable(rows, { "Mario Rossi": [2] });

    const detectedShifts = rows[0].codes
      .map((code, i) => ({ date: `2026-08-${String(i + 1).padStart(2, "0")}`, rawCode: code, confidence: 0.85 }))
      .filter((_, i) => i !== 1);

    const out = await fillGapsFromCellImages({
      buffer: pdf,
      pageIndex: 0,
      tables: [table],
      target: TARGET,
      staffName: "Mario Rossi",
      detectedShifts,
    });

    assert.equal(out.detectedShifts.length, DAYS - 1, "non deve inventare un codice che non ha mai visto");
    assert.equal(out.unresolved.length, 1);
    assert.equal(out.unresolved[0].date, "2026-08-02");
  });

  it("lascia i turni immutati se il PDF non ha celle disegnate", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([300, 300]);
    const plainPdf = Buffer.from(await doc.save());

    const detectedShifts = [{ date: "2026-08-01", rawCode: "M", confidence: 0.85 }];
    const out = await fillGapsFromCellImages({
      buffer: plainPdf,
      pageIndex: 0,
      tables: [],
      target: TARGET,
      staffName: "Mario Rossi",
      detectedShifts,
    });

    assert.deepEqual(out.detectedShifts, detectedShifts, "nessun peggioramento sui documenti di altro tipo");
  });
});
