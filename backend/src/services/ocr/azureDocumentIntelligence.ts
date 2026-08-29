import type { ExtractedTable, OcrProvider, RecognizedWord, TableCell } from "./types.js";

const API_VERSION = "2024-11-30";
const MODEL_ID = "prebuilt-layout";
const POLL_INTERVAL_MS = 2000;
// ~5 minuti di attesa massima. Una singola pagina PDF ritagliata di solito
// finisce in pochi secondi, ma una foto a piena risoluzione (l'app scatta a
// qualita' 0.9, spesso 8-12 megapixel) da analizzare per intero costa
// all'OCR molto piu' lavoro, e il livello gratuito F0 gira su calcolo
// condiviso/meno prioritario: un limite di 1 minuto puo' scadere prima che
// Azure abbia finito, facendo fallire l'analisi anche quando avrebbe dato
// un risultato buono qualche secondo dopo. Non e' una chiamata in piu': e'
// la stessa unica chiamata, a cui diamo piu' tempo per rispondere.
const MAX_POLL_ATTEMPTS = 150;

interface AzureAnalyzeResultTable {
  rowCount: number;
  columnCount: number;
  cells: Array<{
    rowIndex: number;
    columnIndex: number;
    content: string;
    columnSpan?: number;
    rowSpan?: number;
  }>;
}

/** Una parola riconosciuta, come la restituisce Azure: polygon = 4 vertici (8 numeri) nell'ordine x,y. */
interface AzureWord {
  content: string;
  confidence?: number;
  polygon?: number[];
}

interface AzurePage {
  pageNumber: number;
  words?: AzureWord[];
}

interface AzurePollResponse {
  status: "notStarted" | "running" | "succeeded" | "failed";
  analyzeResult?: { tables?: AzureAnalyzeResultTable[]; pages?: AzurePage[] };
  error?: { message?: string };
}

/** Centro del poligono che circonda la parola: basta la media dei vertici. */
function polygonCenter(polygon: number[] | undefined): { x: number; y: number } {
  if (!polygon || polygon.length < 2) return { x: 0, y: 0 };
  let sx = 0;
  let sy = 0;
  for (let i = 0; i + 1 < polygon.length; i += 2) {
    sx += polygon[i];
    sy += polygon[i + 1];
  }
  const points = Math.floor(polygon.length / 2);
  return { x: sx / points, y: sy / points };
}

/**
 * Provider reale basato su Azure AI Document Intelligence (modello "layout"),
 * usato quando MOCK_OCR=false e le credenziali sono configurate.
 * Chiama direttamente la REST API (nessun SDK) per tenere il backend leggero:
 * https://learn.microsoft.com/azure/ai-services/document-intelligence/
 */
export class AzureDocumentIntelligenceProvider implements OcrProvider {
  /**
   * Parole riconosciute nell'ultima analisi. Azure le manda insieme alle
   * tabelle, nella stessa risposta della stessa chiamata: tenerle non costa
   * nulla, e permette di capire se una cella risultata vuota e' stata
   * davvero "non vista" dall'OCR o solo non assegnata alla cella giusta.
   */
  private lastWords: RecognizedWord[] = [];

  constructor(private readonly endpoint: string, private readonly apiKey: string) {}

  getLastRecognizedWords(): RecognizedWord[] {
    return this.lastWords;
  }

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

    this.lastWords = (result.analyzeResult?.pages ?? []).flatMap((page) =>
      (page.words ?? []).map((word): RecognizedWord => {
        const { x, y } = polygonCenter(word.polygon);
        return {
          text: word.content,
          confidence: word.confidence ?? 0,
          x,
          y,
          pageNumber: page.pageNumber,
        };
      }),
    );

    return tables.map((table): ExtractedTable => ({
      rowCount: table.rowCount,
      columnCount: table.columnCount,
      cells: table.cells.map((cell): TableCell => ({
        rowIndex: cell.rowIndex,
        columnIndex: cell.columnIndex,
        text: cell.content ?? "",
        columnSpan: cell.columnSpan,
        rowSpan: cell.rowSpan,
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
