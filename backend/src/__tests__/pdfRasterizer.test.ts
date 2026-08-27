import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { countPdfPages, extractSinglePagePdf, rasterizeAllPages, rasterizePage } from "../services/pdfRasterizer.js";
import { makeTestPdf } from "./fixtures/testPdf.js";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

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
});
