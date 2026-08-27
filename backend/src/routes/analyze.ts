import { Router } from "express";
import rateLimit from "express-rate-limit";
import { upload } from "../middleware/upload.js";
import { extractTablesFromDocx } from "../services/docxTableExtractor.js";
import { AzureDocumentIntelligenceProvider } from "../services/ocr/azureDocumentIntelligence.js";
import { MockOcrProvider } from "../services/ocr/mockProvider.js";
import type { OcrProvider } from "../services/ocr/types.js";
import { PDF_MIME, resolvePdfShiftResult } from "../services/pdfRouting.js";
import { parseShiftGrid, type ShiftGridParseResult } from "../services/shiftGridParser.js";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

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

analyzeRouter.post("/analyze", analyzeLimiter, upload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ success: false, error: "Nessun file ricevuto (campo atteso: 'file')." });
    return;
  }

  const target = resolveTargetMonth(req.body ?? {});
  const staffNameRaw = typeof req.body?.staffName === "string" ? req.body.staffName.trim() : "";
  const staffName = staffNameRaw || undefined;

  try {
    let result: ShiftGridParseResult;
    let routingDebug: string[] = [];

    if (file.mimetype === DOCX_MIME) {
      const tables = await extractTablesFromDocx(file.buffer);
      result = parseShiftGrid(tables, target, staffName);
    } else if (file.mimetype === PDF_MIME) {
      const provider = buildOcrProvider(target);
      ({ result, debug: routingDebug } = await resolvePdfShiftResult(file.buffer, target, staffName, provider));
    } else {
      const tables = await buildOcrProvider(target).extractTables(file.buffer, file.mimetype);
      result = parseShiftGrid(tables, target, staffName);
    }

    if (routingDebug.length > 0) {
      // Visibile nei log del backend (es. scheda "Logs" su Render): utile per
      // capire quale percorso e' stato scelto senza dover leggere il codice.
      // eslint-disable-next-line no-console
      console.log(`[analyze] routing PDF: ${routingDebug.join(" -> ")}`);
    }

    res.json({
      success: true,
      month: target.month1To12,
      year: target.year,
      detectedShifts: result.detectedShifts,
      warnings: result.warnings,
      candidateNames: result.candidateNames,
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
