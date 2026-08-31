import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

/**
 * Molte turnistiche stampano il proprio mese/anno di riferimento da qualche
 * parte nel documento (titolo, intestazione, piede pagina: es. "Turnistica
 * Agosto 2026"). L'app oggi manda al backend il mese scelto dall'utente nel
 * selettore della Home, che pero' e' uno stato locale che riparte SEMPRE dal
 * mese corrente ogni volta che la schermata si monta: se l'utente carica un
 * documento di un mese diverso da quello mostrato in quel momento senza
 * accorgersi di scorrere il selettore, i turni vengono letti correttamente
 * ma etichettati con le date del mese sbagliato — silenziosamente, perche'
 * l'analisi "riesce" comunque (il contenuto della griglia non dipende dal
 * mese target). Chi carica il documento la vede come "non ha rilevato
 * nulla", perche' i turni finiscono nel mese che aveva prima sullo schermo
 * invece che in quello vero, e quando va a controllare il mese giusto lo
 * trova vuoto.
 *
 * Questo modulo cerca SOLO il nome del mese per esteso (mai le abbreviazioni:
 * "Mar" e' anche l'abbreviazione di "Martedi'", userebbe troppi falsi
 * positivi) seguito da un anno a 4 cifre, in tutto il testo incorporato nel
 * PDF. Se trova menzioni concordi di un solo mese/anno, lo restituisce; se
 * non trova nulla o le menzioni sono in disaccordo fra loro, restituisce
 * null e chi chiama non applica nessun controllo — mai un falso allarme che
 * blocchi un caricamento legittimo.
 */

const MONTH_NAMES_IT = [
  "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
];

// Nome del mese per esteso (con eventuali accenti sulle vocali, per
// tollerare varianti come "Febbraìo" generate da alcuni motori PDF) seguito,
// entro una manciata di caratteri (spazi, virgole, un punto), da un anno
// verosimile (2000-2099).
const MONTH_YEAR_RE = new RegExp(
  `\\b(${MONTH_NAMES_IT.join("|")})[^\\d]{0,6}(20\\d{2})\\b`,
  "gi",
);

export interface DetectedDocumentMonth {
  year: number;
  month1To12: number;
}

/** Cerca le menzioni di "<mese per esteso> <anno>" in un testo gia' estratto. Esposta separatamente dal PDF per essere testabile senza costruire un documento vero. */
export function findMonthYearMentions(text: string): DetectedDocumentMonth[] {
  const mentions: DetectedDocumentMonth[] = [];
  for (const match of text.matchAll(MONTH_YEAR_RE)) {
    const monthIndex = MONTH_NAMES_IT.indexOf(match[1].toLowerCase());
    if (monthIndex === -1) continue;
    mentions.push({ month1To12: monthIndex + 1, year: Number(match[2]) });
  }
  return mentions;
}

/**
 * Il mese/anno che il documento dichiara di se stesso, se e solo se tutte le
 * menzioni trovate nel testo sono concordi: un documento reale ne contiene
 * quasi sempre 0 (nessun testo, es. scansione) o molte tutte uguali (titolo
 * ripetuto in intestazione/piede pagina). Menzioni discordanti sono trattate
 * come "non affidabile" (es. un documento che elenca piu' mesi) e restituisce
 * null, per non rischiare un falso allarme.
 */
export async function detectPdfDocumentMonth(buffer: Buffer): Promise<DetectedDocumentMonth | null> {
  const doc = await getDocument({ data: new Uint8Array(buffer) }).promise;
  try {
    const mentions: DetectedDocumentMonth[] = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
      mentions.push(...findMonthYearMentions(text));
    }
    return pickConsistentMention(mentions);
  } finally {
    doc.cleanup();
  }
}

function pickConsistentMention(mentions: DetectedDocumentMonth[]): DetectedDocumentMonth | null {
  if (mentions.length === 0) return null;
  const first = mentions[0];
  const allAgree = mentions.every((m) => m.year === first.year && m.month1To12 === first.month1To12);
  return allAgree ? first : null;
}
