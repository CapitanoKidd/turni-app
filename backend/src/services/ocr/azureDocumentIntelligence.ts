import type { ExtractedTable, OcrProvider, TableCell } from "./types.js";

const API_VERSION = "2024-11-30";
const MODEL_ID = "prebuilt-layout";
const POLL_INTERVAL_MS = 1500;
const MAX_POLL_ATTEMPTS = 40; // ~1 minuto di attesa massima

interface AzureAnalyzeResultTable {
  rowCount: number;
  columnCount: number;
  cells: Array<{ rowIndex: number; columnIndex: number; content: string }>;
}

interface AzurePollResponse {
  status: "notStarted" | "running" | "succeeded" | "failed";
  analyzeResult?: { tables?: AzureAnalyzeResultTable[] };
  error?: { message?: string };
}

/**
 * Provider reale basato su Azure AI Document Intelligence (modello "layout"),
 * usato quando MOCK_OCR=false e le credenziali sono configurate.
 * Chiama direttamente la REST API (nessun SDK) per tenere il backend leggero:
 * https://learn.microsoft.com/azure/ai-services/document-intelligence/
 */
export class AzureDocumentIntelligenceProvider implements OcrProvider {
  constructor(private readonly endpoint: string, private readonly apiKey: string) {}

  async extractTables(buffer: Buffer, mimeType: string): Promise<ExtractedTable[]> {
    const analyzeUrl = `${this.trimEndpoint()}/documentintelligence/documentModels/${MODEL_ID}:analyze?api-version=${API_VERSION}`;

    const submitResponse = await fetch(analyzeUrl, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": this.apiKey,
        "Content-Type": mimeType,
      },
      body: buffer,
    });

    if (submitResponse.status !== 202) {
      const body = await submitResponse.text().catch(() => "");
      throw new Error(`Azure Document Intelligence ha rifiutato la richiesta (${submitResponse.status}): ${body}`);
    }

    const operationLocation = submitResponse.headers.get("operation-location");
    if (!operationLocation) {
      throw new Error("Azure Document Intelligence non ha restituito un operation-location da interrogare.");
    }

    const result = await this.poll(operationLocation);
    const tables = result.analyzeResult?.tables ?? [];

    return tables.map((table): ExtractedTable => ({
      rowCount: table.rowCount,
      columnCount: table.columnCount,
      cells: table.cells.map((cell): TableCell => ({
        rowIndex: cell.rowIndex,
        columnIndex: cell.columnIndex,
        text: cell.content ?? "",
      })),
    }));
  }

  private async poll(operationLocation: string): Promise<AzurePollResponse> {
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      const pollResponse = await fetch(operationLocation, {
        headers: { "Ocp-Apim-Subscription-Key": this.apiKey },
      });

      if (!pollResponse.ok) {
        const body = await pollResponse.text().catch(() => "");
        throw new Error(`Errore durante il polling di Azure Document Intelligence (${pollResponse.status}): ${body}`);
      }

      const payload = (await pollResponse.json()) as AzurePollResponse;

      if (payload.status === "succeeded") {
        return payload;
      }
      if (payload.status === "failed") {
        throw new Error(payload.error?.message ?? "Analisi Azure Document Intelligence fallita.");
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    throw new Error("Timeout in attesa del risultato di Azure Document Intelligence.");
  }

  private trimEndpoint(): string {
    return this.endpoint.replace(/\/+$/, "");
  }
}
