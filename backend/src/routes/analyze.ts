import { Router } from "express";
import rateLimit from "express-rate-limit";
import { upload } from "../middleware/upload.js";
import { extractTablesFromDocx } from "../services/docxTableExtractor.js";
import { AzureDocumentIntelligenceProvider } from "../services/ocr/azureDocumentIntelligence.js";
import { MockOcrProvider } from "../services/ocr/mockProvider.js";
import type { ExtractedTable, OcrProvider } from "../services/ocr/types.js";
import { PDF_MIME, resolvePdfShiftResult } from "../services/pdfRouting.js";
import { parseShiftGrid, withEveryDayOfMonth, type ShiftGridParseResult } from "../services/shiftGridParser.js";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_DEBUG_IMAGES = 5; // limite di sicurezza: un documento con molte pagine non deve gonfiare a dismisura la risposta

const analyzeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30, // 30 analisi ogni 15 minuti per IP: protegge la chiave Azure da abusi
  standardHeaders: true,
  legacyHeaders: false,
});

export const analyzeRouter = Router();

function resolveTargetMonth(body: Record<string, unknown>): { year: number; month1To12: number } {
  const now = new Date();
  const year = Number(body.year) || now.getFullYear();
  const month1To12 = Number(body.month) || now.getMonth() + 1;
  return { year, month1To12 };
}

function buildOcrProvider(target: { year: number; month1To12: number }): OcrProvider {
  const mockOcr = process.env.MOCK_OCR !== "false";

  if (mockOcr) {
    return new MockOcrProvider(target.year, target.month1To12);
  }

  const endpoint = process.env.AZURE_DOCINTEL_ENDPOINT;
  const apiKey = process.env.AZURE_DOCINTEL_KEY;
  if (!endpoint || !apiKey) {
    throw new ServiceUnavailableError(
      "OCR non configurato: impostare AZURE_DOCINTEL_ENDPOINT e AZURE_DOCINTEL_KEY, oppure MOCK_OCR=true per i test.",
    );
  }
  return new AzureDocumentIntelligenceProvider(endpoint, apiKey);
}

class ServiceUnavailableError extends Error {}

/** Mostra le tabelle grezze rilevate (righe/colonne/celle), leggibili da un umano: serve alla modalita' debug. */
function formatTablesForDebug(tables: ExtractedTable[]): string {
  if (tables.length === 0) return "(nessuna tabella rilevata)";

  return tables
    .map((table, tableIndex) => {
      const byRow = new Map<number, Map<number, string>>();
      for (const cell of table.cells) {
        if (!byRow.has(cell.rowIndex)) byRow.set(cell.rowIndex, new Map());
        byRow.get(cell.rowIndex)?.set(cell.columnIndex, cell.text.replace(/\n/g, "⏎"));
      }

      const rowIndexes = [...byRow.keys()].sort((a, b) => a - b);
      const lines = rowIndexes.map((rowIndex) => {
        const cols = byRow.get(rowIndex);
        if (!cols) return `  riga ${rowIndex}: (vuota)`;
        const maxCol = Math.max(...cols.keys());
        const cellsText = Array.from({ length: maxCol + 1 }, (_, c) => cols.get(c) ?? "·").join(" | ");
        return `  riga ${rowIndex}: ${cellsText}`;
      });

      return `Tabella ${tableIndex + 1} (${table.rowCount} righe x ${table.columnCount} colonne):\n${lines.join("\n")}`;
    })
    .join("\n\n");
}

analyzeRouter.post("/analyze", analyzeLimiter, upload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ success: false, error: "Nessun file ricevuto (campo atteso: 'file')." });
    return;
  }

  const target = resolveTargetMonth(req.body ?? {});
  const staffNameRaw = typeof req.body?.staffName === "string" ? req.body.staffName.trim() : "";
  const staffName = staffNameRaw || undefined;
  const debugRequested = req.body?.debug === "true" || req.body?.debug === true;

  try {
    let result: ShiftGridParseResult;
    let routingDebug: string[] = [];
    let debugTables: ExtractedTable[] = [];
    let rasterizedImages: Buffer[] = [];

    if (file.mimetype === DOCX_MIME) {
      debugTables = await extractTablesFromDocx(file.buffer);
      result = parseShiftGrid(debugTables, target, staffName);
    } else if (file.mimetype === PDF_MIME) {
      const provider = buildOcrProvider(target);
      const outcome = await resolvePdfShiftResult(file.buffer, target, staffName, provider);
      result = outcome.result;
      routingDebug = outcome.debug;
      debugTables = outcome.tables;
      rasterizedImages = outcome.rasterizedImages;
    } else {
      debugTables = await buildOcrProvider(target).extractTables(file.buffer, file.mimetype);
      result = parseShiftGrid(debugTables, target, staffName);
    }

    if (routingDebug.length > 0) {
      // Visibile nei log del backend (es. scheda "Logs" su Render): utile per
      // capire quale percorso e' stato scelto senza dover leggere il codice.
      // eslint-disable-next-line no-console
      console.log(`[analyze] routing PDF: ${routingDebug.join(" -> ")}`);
    }

    // Un nome ambiguo (candidateNames) non ha ancora una riga scelta: niente
    // da completare, l'app chiedera' prima all'utente chi e' lui/lei e
    // ripetera' l'analisi. In ogni altro caso l'utente vede sempre tutti i
    // giorni del mese, riconosciuti o "vuoto" che siano.
    const hasAmbiguousName = (result.candidateNames?.length ?? 0) > 0;
    const detectedShifts = hasAmbiguousName ? result.detectedShifts : withEveryDayOfMonth(result.detectedShifts, target);

    res.json({
      success: true,
      month: target.month1To12,
      year: target.year,
      detectedShifts,
      warnings: result.warnings,
      candidateNames: result.candidateNames,
      ...(debugRequested
        ? {
            debugText: [...routingDebug, "", formatTablesForDebug(debugTables)].filter(Boolean).join("\n"),
            // Le immagini effettivamente inviate ad Azure per la rasterizzazione
            // (vuoto se non e' stata necessaria): permettono di vedere con i
            // propri occhi cosa "vede" Azure, invece di indovinare se un
            // problema e' nella rasterizzazione o nella lettura del contenuto.
            debugImages: rasterizedImages
              .slice(0, MAX_DEBUG_IMAGES)
              .map((png) => `data:image/png;base64,${png.toString("base64")}`),
          }
        : {}),
    });
  } catch (error) {
    if (error instanceof ServiceUnavailableError) {
      res.status(503).json({ success: false, error: error.message });
      return;
    }
    // eslint-disable-next-line no-console
    console.error("Errore durante l'analisi del file:", error);
    res.status(500).json({ success: false, error: "Analisi del documento fallita. Riprova." });
  }
  // Nota: `file.buffer` vive solo nello scope di questa richiesta (multer
  // memoryStorage) e viene garbage-collected subito dopo la risposta:
  // nessuna scrittura su disco o su database avviene in nessun punto.
});
