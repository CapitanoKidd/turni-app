import { Router } from "express";
import rateLimit from "express-rate-limit";
import { upload } from "../middleware/upload.js";
import { extractTablesFromDocx } from "../services/docxTableExtractor.js";
import { AzureDocumentIntelligenceProvider } from "../services/ocr/azureDocumentIntelligence.js";
import { MockOcrProvider } from "../services/ocr/mockProvider.js";
import type { ExtractedTable, OcrProvider, RecognizedWord } from "../services/ocr/types.js";
import { PDF_MIME, resolvePdfShiftResult } from "../services/pdfRouting.js";
import { parseShiftGrid, withEveryDayOfMonth, type ShiftGridParseResult } from "../services/shiftGridParser.js";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_DEBUG_IMAGES = 5; // limite di sicurezza: un documento con molte pagine non deve gonfiare a dismisura la risposta

/**
 * Limite per indirizzo IP. Va inteso per quello che e': un dosso contro gli
 * script, non un cancello — chi abusa cambia IP, e un limite troppo stretto
 * bloccherebbe utenti veri, perche' gli operatori mobili fanno condividere lo
 * stesso IP pubblico a moltissimi clienti.
 *
 * Il valore e' calibrato sull'uso reale: un piano turni si carica una volta al
 * mese, quindi 10 all'ora e' larghissimo per una persona e stretto per uno
 * script (da ~2880 al giorno a 240).
 */
const analyzeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Troppe analisi in poco tempo: riprova fra un'ora." },
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

/** Impronte note inviate dall'app (JSON in un campo del form). Un dato malformato viene semplicemente ignorato. */
function parseKnownCells(raw: unknown): Record<string, string> | undefined {
  if (typeof raw !== "string" || raw.trim().length === 0) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    const entries = Object.entries(parsed as Record<string, unknown>)
      .filter(([, value]) => typeof value === "string" && value.length > 0)
      .slice(0, 2000) as Array<[string, string]>;
    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
  } catch {
    return undefined;
  }
}

/** Mostra le tabelle grezze rilevate (righe/colonne/celle), leggibili da un umano: serve alla modalita' debug. */
function formatTablesForDebug(tables: ExtractedTable[]): string {
  if (tables.length === 0) return "(nessuna tabella rilevata)";

  return tables
    .map((table, tableIndex) => {
      const byRow = new Map<number, Map<number, string>>();
      for (const cell of table.cells) {
        if (!byRow.has(cell.rowIndex)) byRow.set(cell.rowIndex, new Map());
        // Una cella che ne occupa piu' d'una viene segnalata: spiegherebbe
        // perche' le colonne accanto risultano vuote.
        const span = (cell.columnSpan ?? 1) > 1 ? `[occupa ${cell.columnSpan} colonne]` : "";
        byRow.get(cell.rowIndex)?.set(cell.columnIndex, cell.text.replace(/\n/g, "⏎") + span);
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

/**
 * Riassume cosa l'OCR dice di aver riconosciuto, con la confidenza piu'
 * bassa in evidenza. Serve a rispondere alla domanda: quando una cella
 * risulta vuota, l'OCR quel segno non l'ha proprio visto, oppure l'ha visto
 * (magari con poca sicurezza) e non l'ha messo nella cella?
 */
function formatRecognizedWordsForDebug(words: RecognizedWord[]): string {
  if (words.length === 0) {
    return "(l'OCR non ha restituito nessuna parola: o il documento e' stato letto come testo gia' presente nel PDF, oppure non ha riconosciuto nulla visivamente)";
  }

  const sorted = [...words].sort((a, b) => a.confidence - b.confidence);
  const lowest = sorted.slice(0, 25);
  const avg = words.reduce((sum, w) => sum + w.confidence, 0) / words.length;
  const weak = words.filter((w) => w.confidence < 0.5).length;

  const lines = lowest.map(
    (w) => `  "${w.text}" — sicurezza ${(w.confidence * 100).toFixed(0)}% (pagina ${w.pageNumber}, x=${w.x.toFixed(2)} y=${w.y.toFixed(2)})`,
  );

  return [
    `Parole riconosciute in totale: ${words.length} — sicurezza media ${(avg * 100).toFixed(0)}%, sotto il 50%: ${weak}`,
    "Le 25 riconosciute con meno sicurezza:",
    ...lines,
  ].join("\n");
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
  const knownCells = parseKnownCells(req.body?.knownCells);

  try {
    let result: ShiftGridParseResult;
    let routingDebug: string[] = [];
    let debugTables: ExtractedTable[] = [];
    let sentPreviewImages: Buffer[] = [];
    let recognizedWords: RecognizedWord[] = [];
    let unresolvedCells: Array<{ date: string; fingerprint: string }> = [];
    let learnedCells: Record<string, string> = {};

    if (file.mimetype === DOCX_MIME) {
      debugTables = await extractTablesFromDocx(file.buffer);
      result = parseShiftGrid(debugTables, target, staffName);
    } else if (file.mimetype === PDF_MIME) {
      const provider = buildOcrProvider(target);
      const outcome = await resolvePdfShiftResult(file.buffer, target, staffName, provider, {
        debug: debugRequested,
        knownCells,
      });
      result = outcome.result;
      routingDebug = outcome.debug;
      debugTables = outcome.tables;
      sentPreviewImages = outcome.sentPreviewImages;
      recognizedWords = outcome.recognizedWords;
      unresolvedCells = outcome.unresolvedCells ?? [];
      learnedCells = outcome.learnedCells ?? {};
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
      // Memoria dei simboli: cosa resta da farsi spiegare dall'utente, e cosa
      // abbiamo imparato qui. L'app conserva tutto sul telefono: il backend
      // resta senza memoria e senza account.
      ...(unresolvedCells.length > 0 ? { unresolvedCells } : {}),
      ...(Object.keys(learnedCells).length > 0 ? { learnedCells } : {}),
      ...(debugRequested
        ? {
            debugText: [
              "=== COSA ABBIAMO FATTO ===",
              ...routingDebug,
              "",
              "=== COSA AZURE CI HA RISPOSTO (tabelle) ===",
              formatTablesForDebug(debugTables),
              "",
              "=== COSA AZURE DICE DI AVER VISTO (parole + sicurezza) ===",
              formatRecognizedWordsForDebug(recognizedWords),
            ].join("\n"),
            // Anteprima di cio' che e' stato inviato ad Azure. Ad Azure va un
            // PDF, non un'immagine: queste sono le stesse pagine inviate,
            // disegnate come immagine qui sul server solo per poterle vedere
            // (nessuna chiamata ad Azure in piu').
            debugImages: sentPreviewImages
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
    // Il messaggio, quando lo generiamo noi (timeout, rifiuto di Azure...),
    // non contiene mai segreti (endpoint/chiave non compaiono in nessun
    // errore che costruiamo): mostrarlo all'utente, invece di un generico
    // "riprova", e' cio' che permette di capire cosa e' andato storto senza
    // dover leggere i log del server ogni volta.
    const message = error instanceof Error && error.message ? error.message : "Analisi del documento fallita. Riprova.";
    res.status(500).json({ success: false, error: message });
  }
  // Nota: `file.buffer` vive solo nello scope di questa richiesta (multer
  // memoryStorage) e viene garbage-collected subito dopo la risposta:
  // nessuna scrittura su disco o su database avviene in nessun punto.
});
