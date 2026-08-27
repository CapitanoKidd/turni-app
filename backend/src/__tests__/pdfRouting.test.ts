import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExtractedTable, OcrProvider, TableCell } from "../services/ocr/types.js";
import { PDF_MIME, PNG_MIME, resolvePdfShiftResult } from "../services/pdfRouting.js";
import { makeTestPdf } from "./fixtures/testPdf.js";

const TARGET_2026_08 = { year: 2026, month1To12: 8 };

function rosterTable(name: string, code: string, days = 31): ExtractedTable {
  const header: TableCell[] = Array.from({ length: days }, (_, i) => ({ rowIndex: 0, columnIndex: i + 1, text: String(i + 1) }));
  const row: TableCell[] = [
    { rowIndex: 1, columnIndex: 0, text: name },
    ...Array.from({ length: days }, (_, i) => ({ rowIndex: 1, columnIndex: i + 1, text: code })),
  ];
  return { rowCount: 2, columnCount: days + 1, cells: [...header, ...row] };
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
  it("trova la pagina giusta e non rasterizza se il risultato diretto e' gia' buono", async () => {
    const pdf = await makeTestPdf([{ lines: ["Mario Rossi"] }, { lines: ["Luigi Verdi"] }]);
    const provider = new FakeOcrProvider([[rosterTable("Mario Rossi", "M")]]);

    const { result } = await resolvePdfShiftResult(pdf, TARGET_2026_08, "Mario Rossi", provider);

    assert.equal(provider.calls.length, 1, "una sola chiamata: nessun fallback necessario");
    assert.equal(provider.calls[0].mimeType, PDF_MIME, "il tentativo diretto invia un PDF, non un'immagine");
    assert.equal(result.detectedShifts.length, 31);
  });

  it("rasterizza solo la pagina trovata se il risultato diretto e' scarso", async () => {
    const pdf = await makeTestPdf([{ lines: ["Mario Rossi"] }]);
    const provider = new FakeOcrProvider([
      [], // tentativo diretto: nessuna tabella riconosciuta
      [rosterTable("Mario Rossi", "M")], // tentativo rasterizzato: va bene
    ]);

    const { result } = await resolvePdfShiftResult(pdf, TARGET_2026_08, "Mario Rossi", provider);

    assert.equal(provider.calls.length, 2, "deve scattare il fallback di rasterizzazione");
    assert.equal(provider.calls[1].mimeType, PNG_MIME, "il fallback invia un'immagine, come le foto");
    assert.equal(result.detectedShifts.length, 31);
  });

  it("elabora l'intero documento come rete di sicurezza se il nome non viene trovato in nessuna pagina", async () => {
    const pdf = await makeTestPdf([{ lines: ["Mario Rossi"] }, { lines: ["Luigi Verdi"] }]);
    const provider = new FakeOcrProvider([[rosterTable("Anna Bianchi", "N")]]);

    const { result, debug } = await resolvePdfShiftResult(pdf, TARGET_2026_08, "Anna Bianchi", provider);

    assert.equal(provider.calls.length, 1);
    assert.equal(provider.calls[0].mimeType, PDF_MIME);
    assert.equal(result.detectedShifts.length, 31);
    assert.ok(debug.some((line) => line.includes("elaboro l'intero documento")));
  });

  it("funziona anche senza nessun nome utente fornito (elabora l'intero documento)", async () => {
    const pdf = await makeTestPdf([{ lines: ["Mario Rossi"] }]);
    const provider = new FakeOcrProvider([[rosterTable("Mario Rossi", "M")]]);

    const { result } = await resolvePdfShiftResult(pdf, TARGET_2026_08, undefined, provider);

    assert.equal(provider.calls.length, 1);
    // Senza nome, il documento intero va comunque analizzato: se la tabella
    // ha un'unica persona la si riconosce comunque come candidato.
    assert.ok(result.detectedShifts.length > 0 || (result.candidateNames?.length ?? 0) > 0);
  });
});
