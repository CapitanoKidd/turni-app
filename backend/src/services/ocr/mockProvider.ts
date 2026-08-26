import type { ExtractedTable, OcrProvider } from "./types.js";

function daysInMonth(year: number, month1To12: number): number {
  return new Date(year, month1To12, 0).getDate();
}

/**
 * Provider "finto" usato finche' non e' disponibile una chiave Azure valida
 * (MOCK_OCR=true, default). Restituisce una tabella di esempio con due righe:
 * la prima con i numeri dei giorni del mese richiesto, la seconda con una
 * rotazione di turni plausibile (M/M/P/P/N/N/R). Serve solo a far funzionare
 * l'intero flusso app -> backend -> revisione -> calendario -> sveglie senza
 * dover chiamare un servizio esterno.
 */
export class MockOcrProvider implements OcrProvider {
  constructor(private readonly targetYear: number, private readonly targetMonth1To12: number) {}

  async extractTables(): Promise<ExtractedTable[]> {
    const pattern = ["M", "M", "P", "P", "N", "N", "R"];
    const total = daysInMonth(this.targetYear, this.targetMonth1To12);

    const dayCells = Array.from({ length: total }, (_, i) => ({
      rowIndex: 0,
      columnIndex: i,
      text: String(i + 1),
    }));
    const codeCells = Array.from({ length: total }, (_, i) => ({
      rowIndex: 1,
      columnIndex: i,
      text: pattern[i % pattern.length],
    }));

    const table: ExtractedTable = {
      rowCount: 2,
      columnCount: total,
      cells: [...dayCells, ...codeCells],
    };

    return [table];
  }
}
