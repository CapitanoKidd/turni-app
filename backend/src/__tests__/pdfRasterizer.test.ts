import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findStaffRowBand } from "../services/findStaffPage.js";
import {
  countPdfPages,
  extractSinglePagePdf,
  rasterizeAllPages,
  rasterizePage,
  rasterizeStaffRowBand,
} from "../services/pdfRasterizer.js";
import { makeTestPdf } from "./fixtures/testPdf.js";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

/** Stessa fixture di findStaffPage.test.ts: intestazione + righe dati come le avrebbe un vero PDF vettoriale. */
function rosterPage(names: string[]) {
  const dayHeader = Array.from({ length: 10 }, (_, i) => String(i + 1).padStart(2, "0"));
  return {
    lines: [
      "Turnistica Agosto 2026",
      dayHeader,
      ...names.map((name) => [name, ...Array.from({ length: 10 }, () => "M")]),
    ],
  };
}

describe("pdfRasterizer", () => {
  it("rasterizza una pagina in un PNG valido", async () => {
    const pdf = await makeTestPdf([{ lines: ["Pagina 1"] }, { lines: ["Pagina 2"] }]);
    const png = await rasterizePage(pdf, 0);
    assert.ok(png.length > 0);
    assert.ok(png.subarray(0, 4).equals(PNG_MAGIC), "il file deve iniziare con la firma PNG");
  });

  it("rasterizza tutte le pagine, una per pagina", async () => {
    const pdf = await makeTestPdf([{ lines: ["A"] }, { lines: ["B"] }, { lines: ["C"] }]);
    const pages = await rasterizeAllPages(pdf);
    assert.equal(pages.length, 3);
    for (const png of pages) {
      assert.ok(png.subarray(0, 4).equals(PNG_MAGIC));
    }
  });

  it("isola una singola pagina in un nuovo PDF di una pagina sola", async () => {
    const pdf = await makeTestPdf([{ lines: ["Pagina 1"] }, { lines: ["Pagina 2"] }, { lines: ["Pagina 3"] }]);
    const singlePage = await extractSinglePagePdf(pdf, 1);
    const count = await countPdfPages(singlePage);
    assert.equal(count, 1);
  });

  it("rasterizza solo intestazione + riga (fascia), producendo un'immagine piu' piccola dell'intera pagina", async () => {
    const pdf = await makeTestPdf([rosterPage(["Anna Bianchi", "Mario Rossi", "Luigi Verdi", "Sara Neri", "Elio Conti"])]);
    const band = await findStaffRowBand(pdf, 0, "Mario Rossi");
    assert.ok(band, "la fixture deve produrre una fascia valida (altrimenti il test non verifica nulla)");

    const fullPagePng = await rasterizePage(pdf, 0);
    const bandPng = await rasterizeStaffRowBand(pdf, 0, band);

    for (const png of [fullPagePng, bandPng]) {
      assert.ok(png.length > 0);
      assert.ok(png.subarray(0, 4).equals(PNG_MAGIC), "il file deve iniziare con la firma PNG");
    }

    const [fullHeight, bandHeight] = await Promise.all([pngHeight(fullPagePng), pngHeight(bandPng)]);
    assert.ok(
      bandHeight < fullHeight,
      `l'immagine ritagliata (${bandHeight}px) deve essere piu' bassa dell'intera pagina (${fullHeight}px)`,
    );
  });
});

/** Legge l'altezza da un PNG (bytes 20-23 dell'header IHDR), per confrontare le dimensioni senza dipendenze aggiuntive. */
async function pngHeight(png: Buffer): Promise<number> {
  return png.readUInt32BE(20);
}
