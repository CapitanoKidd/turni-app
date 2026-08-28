import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExtractedTable, OcrProvider, TableCell } from "../services/ocr/types.js";
import { PDF_MIME, resolvePdfShiftResult } from "../services/pdfRouting.js";
import { makeTestPdf } from "./fixtures/testPdf.js";

const TARGET_2026_08 = { year: 2026, month1To12: 8 };

function rosterTable(name: string, code: string, days = 31): ExtractedTable {
  return rosterTableWithCodes(name, Array.from({ length: days }, () => code));
}

/** Come rosterTable, ma con un codice diverso per ogni giorno (stringa vuota = cella mancante, come una cella che Azure lascia vuota). */
function rosterTableWithCodes(name: string, codes: string[]): ExtractedTable {
  const header: TableCell[] = codes.map((_, i) => ({ rowIndex: 0, columnIndex: i + 1, text: String(i + 1) }));
  const row: TableCell[] = [
    { rowIndex: 1, columnIndex: 0, text: name },
    ...codes.map((code, i) => ({ rowIndex: 1, columnIndex: i + 1, text: code })),
  ];
  return { rowCount: 2, columnCount: codes.length + 1, cells: [...header, ...row] };
}

/** Intestazione + righe dati come le avrebbe un vero PDF vettoriale (numeri/nomi come elementi di testo separati), cosi' findStaffRowBand puo' individuare la fascia da ritagliare. */
function rosterPdfPage(names: string[]) {
  const dayHeader = Array.from({ length: 10 }, (_, i) => String(i + 1).padStart(2, "0"));
  return {
    lines: [
      "Turnistica Agosto 2026",
      dayHeader,
      ...names.map((name) => [name, ...Array.from({ length: 10 }, () => "M")]),
    ],
  };
}

/** Provider Azure finto: restituisce le risposte fornite, una per chiamata, e registra come e' stato chiamato. */
class FakeOcrProvider implements OcrProvider {
  calls: Array<{ mimeType: string }> = [];
  constructor(private readonly responses: ExtractedTable[][]) {}

  async extractTables(_buffer: Buffer, mimeType: string): Promise<ExtractedTable[]> {
    const response = this.responses[this.calls.length] ?? this.responses[this.responses.length - 1] ?? [];
    this.calls.push({ mimeType });
    return response;
  }
}

describe("resolvePdfShiftResult", () => {
  it("fa UNA SOLA chiamata ad Azure, inviando solo la pagina del dipendente in PDF", async () => {
    const pdf = await makeTestPdf([{ lines: ["Mario Rossi"] }, { lines: ["Luigi Verdi"] }]);
    const provider = new FakeOcrProvider([[rosterTable("Mario Rossi", "M")]]);

    const { result } = await resolvePdfShiftResult(pdf, TARGET_2026_08, "Mario Rossi", provider);

    assert.equal(provider.calls.length, 1, "una sola chiamata ad Azure, sempre");
    assert.equal(provider.calls[0].mimeType, PDF_MIME, "si invia il PDF, non un'immagine");
    assert.equal(result.detectedShifts.length, 31);
  });

  it("non fa una seconda chiamata nemmeno quando il risultato e' parziale", async () => {
    const pdf = await makeTestPdf([rosterPdfPage(["Anna Bianchi", "Mario Rossi", "Luigi Verdi"])]);
    // Mancano due giorni: in passato questo faceva scattare un secondo
    // tentativo rasterizzato. Ora il risultato parziale va restituito com'e'.
    const partialCodes = Array.from({ length: 31 }, (_, i) => (i === 26 || i === 27 ? "" : "M"));
    const provider = new FakeOcrProvider([[rosterTableWithCodes("Mario Rossi", partialCodes)]]);

    const { result } = await resolvePdfShiftResult(pdf, TARGET_2026_08, "Mario Rossi", provider);

    assert.equal(provider.calls.length, 1, "una copertura parziale NON deve piu' attivare un secondo tentativo");
    assert.equal(result.detectedShifts.length, 29, "i giorni trovati restano quelli, senza tentativi di recupero");
  });

  it("non fa una seconda chiamata nemmeno quando Azure non restituisce nulla", async () => {
    const pdf = await makeTestPdf([{ lines: ["Mario Rossi"] }]);
    const provider = new FakeOcrProvider([[]]); // nessuna tabella riconosciuta

    const { result } = await resolvePdfShiftResult(pdf, TARGET_2026_08, "Mario Rossi", provider);

    assert.equal(provider.calls.length, 1, "nessun secondo tentativo nemmeno in caso di fallimento totale");
    assert.equal(result.detectedShifts.length, 0);
  });

  it("elabora l'intero documento con una sola chiamata se il nome non viene trovato", async () => {
    const pdf = await makeTestPdf([{ lines: ["Mario Rossi"] }, { lines: ["Luigi Verdi"] }]);
    const provider = new FakeOcrProvider([[rosterTable("Anna Bianchi", "N")]]);

    const { result, debug } = await resolvePdfShiftResult(pdf, TARGET_2026_08, "Anna Bianchi", provider);

    assert.equal(provider.calls.length, 1);
    assert.equal(provider.calls[0].mimeType, PDF_MIME);
    assert.equal(result.detectedShifts.length, 31);
    assert.ok(debug.some((line) => line.includes("l'intero documento")));
  });

  it("funziona anche senza nessun nome utente fornito (una sola chiamata)", async () => {
    const pdf = await makeTestPdf([{ lines: ["Mario Rossi"] }]);
    const provider = new FakeOcrProvider([[rosterTable("Mario Rossi", "M")]]);

    const { result } = await resolvePdfShiftResult(pdf, TARGET_2026_08, undefined, provider);

    assert.equal(provider.calls.length, 1);
    assert.ok(result.detectedShifts.length > 0 || (result.candidateNames?.length ?? 0) > 0);
  });

  it("senza modalita' debug non genera nessuna anteprima; con il debug attivo genera l'anteprima di cio' che e' stato inviato", async () => {
    const pdf = await makeTestPdf([{ lines: ["Mario Rossi"] }]);
    const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

    const quiet = await resolvePdfShiftResult(
      pdf,
      TARGET_2026_08,
      "Mario Rossi",
      new FakeOcrProvider([[rosterTable("Mario Rossi", "M")]]),
    );
    assert.equal(quiet.sentPreviewImages.length, 0, "senza debug non si spreca CPU a disegnare anteprime");

    const verbose = await resolvePdfShiftResult(
      pdf,
      TARGET_2026_08,
      "Mario Rossi",
      new FakeOcrProvider([[rosterTable("Mario Rossi", "M")]]),
      { debug: true },
    );
    assert.equal(verbose.sentPreviewImages.length, 1, "con il debug si mostra cosa e' stato inviato");
    assert.ok(verbose.sentPreviewImages[0].subarray(0, 4).equals(PNG_MAGIC));
  });
});
