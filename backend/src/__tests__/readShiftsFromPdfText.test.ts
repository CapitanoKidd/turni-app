import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { readShiftsFromPdfText } from "../services/readShiftsFromPdfText.js";

const TARGET = { year: 2026, month1To12: 8 };

/** Turnistica con i codici scritti come TESTO: quella che si puo' leggere senza pagare nessuna analisi. */
async function makeTextRosterPdf(rows: Array<{ name: string; codes: string[] }>, days = 31): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([700, 320]);
  const x0 = 120;
  const step = 18;
  const headerY = 260;

  for (let d = 1; d <= days; d++) {
    page.drawText(String(d).padStart(2, "0"), { x: x0 + (d - 1) * step, y: headerY, size: 7, font });
  }
  rows.forEach((row, i) => {
    const y = headerY - 25 * (i + 1);
    page.drawText(row.name, { x: 20, y, size: 8, font });
    row.codes.forEach((code, d) => {
      page.drawText(code, { x: x0 + d * step, y, size: 7, font });
    });
  });
  return Buffer.from(await doc.save());
}

describe("readShiftsFromPdfText", () => {
  it("legge i turni dal testo del PDF, senza nessuna analisi esterna", async () => {
    const codes = Array.from({ length: 31 }, (_, i) => (i % 3 === 0 ? "M" : i % 3 === 1 ? "P" : "-"));
    const pdf = await makeTextRosterPdf([
      { name: "Anna Bianchi", codes: Array.from({ length: 31 }, () => "N") },
      { name: "Mario Rossi", codes },
    ]);

    const out = await readShiftsFromPdfText(pdf, 0, TARGET, "Mario Rossi");

    assert.ok(out, "doveva leggere i turni dal testo");
    assert.equal(out.detectedShifts.length, 31);
    assert.equal(out.detectedShifts[0].rawCode, "M");
    assert.equal(out.detectedShifts[2].rawCode, "-");
    assert.equal(out.detectedShifts[0].confidence, 1, "lettura esatta: fiducia massima");
    // Deve aver preso la riga giusta, non quella del collega.
    assert.ok(!out.detectedShifts.some((s) => s.rawCode === "N"), "non deve leggere la riga di un'altra persona");
  });

  it("restituisce null se il nome non compare (meglio l'analisi che una riga sbagliata)", async () => {
    const pdf = await makeTextRosterPdf([{ name: "Anna Bianchi", codes: Array.from({ length: 31 }, () => "M") }]);
    assert.equal(await readShiftsFromPdfText(pdf, 0, TARGET, "Mario Rossi"), null);
  });

  it("restituisce null senza nome utente", async () => {
    const pdf = await makeTextRosterPdf([{ name: "Mario Rossi", codes: Array.from({ length: 31 }, () => "M") }]);
    assert.equal(await readShiftsFromPdfText(pdf, 0, TARGET, undefined), null);
  });

  it("restituisce null se la riga ha testo solo su pochi giorni (griglia non davvero testuale)", async () => {
    const sparse = Array.from({ length: 31 }, (_, i) => (i < 5 ? "M" : " "));
    const pdf = await makeTextRosterPdf([{ name: "Mario Rossi", codes: sparse }]);
    assert.equal(
      await readShiftsFromPdfText(pdf, 0, TARGET, "Mario Rossi"),
      null,
      "sotto la soglia si prosegue con l'analisi invece di restituire un risultato pieno di buchi",
    );
  });

  it("restituisce null su un PDF senza griglia", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([300, 300]);
    const plain = Buffer.from(await doc.save());
    assert.equal(await readShiftsFromPdfText(plain, 0, TARGET, "Mario Rossi"), null);
  });
});
