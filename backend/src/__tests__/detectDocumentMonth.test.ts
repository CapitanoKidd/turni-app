import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { detectPdfDocumentMonth, findMonthYearMentions } from "../services/detectDocumentMonth.js";

async function makePdfWithText(lines: string[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([400, 200]);
  lines.forEach((line, i) => {
    page.drawText(line, { x: 20, y: 180 - i * 20, size: 10, font });
  });
  return Buffer.from(await doc.save());
}

describe("findMonthYearMentions", () => {
  it("trova mese per esteso + anno nel testo", () => {
    const mentions = findMonthYearMentions("Turnistica Agosto 2026");
    assert.deepEqual(mentions, [{ month1To12: 8, year: 2026 }]);
  });

  it("non confonde l'abbreviazione di un giorno della settimana ('Mar') con Marzo", () => {
    // Riga tipica di intestazione settimanale: nessun mese per esteso qui.
    const mentions = findMonthYearMentions("Lu Ma Me Gi Ve Sa Do 2026");
    assert.deepEqual(mentions, []);
  });

  it("ignora un anno non plausibile (non 20xx)", () => {
    assert.deepEqual(findMonthYearMentions("Agosto 1998"), []);
  });

  it("trova piu' menzioni concordi (titolo ripetuto in intestazione e piede pagina)", () => {
    const mentions = findMonthYearMentions("Turnistica Agosto 2026 ... pagina 1 di 2 - Agosto 2026");
    assert.equal(mentions.length, 2);
    assert.ok(mentions.every((m) => m.month1To12 === 8 && m.year === 2026));
  });
});

describe("detectPdfDocumentMonth", () => {
  it("rileva il mese quando il documento lo dichiara in intestazione", async () => {
    const pdf = await makePdfWithText(["Turnistica Settembre 2026", "Mario Rossi"]);
    const detected = await detectPdfDocumentMonth(pdf);
    assert.deepEqual(detected, { month1To12: 9, year: 2026 });
  });

  it("restituisce null se il documento non menziona nessun mese", async () => {
    const pdf = await makePdfWithText(["Mario Rossi", "1 2 3 M P N"]);
    const detected = await detectPdfDocumentMonth(pdf);
    assert.equal(detected, null);
  });

  it("restituisce null se le menzioni sono discordanti (mai un falso allarme)", async () => {
    const pdf = await makePdfWithText(["Confronto Agosto 2026 vs Settembre 2026"]);
    const detected = await detectPdfDocumentMonth(pdf);
    assert.equal(detected, null);
  });
});
