import cors from "cors";
import "dotenv/config";
import express from "express";
import { analyzeRouter } from "./routes/analyze.js";

const app = express();
const port = Number(process.env.PORT) || 3000;
const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";

app.use(cors({ origin: allowedOrigin }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", mockOcr: process.env.MOCK_OCR !== "false" });
});

app.use("/api", analyzeRouter);

// Gestore errori generico (es. file troppo grande o tipo non accettato da multer)
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(400).json({ success: false, error: err.message || "Richiesta non valida." });
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend turni in ascolto su http://localhost:${port} (MOCK_OCR=${process.env.MOCK_OCR !== "false"})`);
});
