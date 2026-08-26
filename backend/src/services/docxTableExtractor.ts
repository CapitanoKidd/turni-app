import * as cheerio from "cheerio";
import mammoth from "mammoth";
import type { ExtractedTable } from "./ocr/types.js";

/**
 * I file .docx contengono gia' le tabelle in modo strutturato (XML), quindi
 * non serve passare da OCR/Azure: si converte il documento in HTML con
 * mammoth e si leggono direttamente le celle delle tabelle. Piu' accurato
 * e piu' economico rispetto a trattare il docx come un'immagine.
 */
export async function extractTablesFromDocx(buffer: Buffer): Promise<ExtractedTable[]> {
  const { value: html } = await mammoth.convertToHtml({ buffer });
  const $ = cheerio.load(html);

  const tables: ExtractedTable[] = [];

  $("table").each((_, tableEl) => {
    const cells: ExtractedTable["cells"] = [];
    let columnCount = 0;

    $(tableEl)
      .find("tr")
      .each((rowIndex, rowEl) => {
        let columnIndex = 0;
        $(rowEl)
          .find("td, th")
          .each((_, cellEl) => {
            const text = $(cellEl).text().replace(/\s+/g, " ").trim();
            cells.push({ rowIndex, columnIndex, text });
            columnIndex += 1;
          });
        columnCount = Math.max(columnCount, columnIndex);
      });

    const rowCount = $(tableEl).find("tr").length;
    if (rowCount > 0 && columnCount > 0) {
      tables.push({ rowCount, columnCount, cells });
    }
  });

  return tables;
}
