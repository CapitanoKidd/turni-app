import multer from "multer";

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15MB

const ACCEPTED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/webp",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
]);

// Storage in memoria: il file non tocca MAI il disco e viene scartato non
// appena la request termina (nessuna persistenza, come richiesto).
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, callback) => {
    if (!ACCEPTED_MIME_TYPES.has(file.mimetype)) {
      callback(new Error(`Formato file non supportato: ${file.mimetype}`));
      return;
    }
    callback(null, true);
  },
});
