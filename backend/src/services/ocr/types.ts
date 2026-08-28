/**
 * Rappresentazione generica di una tabella estratta da un documento,
 * indipendente dalla sorgente (OCR Azure su immagine/PDF, oppure lettura
 * diretta delle tabelle di un .docx). Il parser dei turni lavora sempre
 * su questa struttura, cosi' e' facile aggiungere/sostituire provider OCR.
 */
export interface TableCell {
  rowIndex: number;
  columnIndex: number;
  text: string;
  /** Quante colonne/righe occupa la cella (assente = 1). Serve a capire se una cella "vuota" e' in realta' inglobata in una cella vicina piu' larga. */
  columnSpan?: number;
  rowSpan?: number;
}

/**
 * Una parola riconosciuta dall'OCR, con la sua posizione e quanto il motore
 * e' sicuro di averla letta bene (0-1). Serve a distinguere due casi molto
 * diversi quando una cella risulta vuota: l'OCR non ha visto proprio nulla
 * li' (limite di lettura), oppure ha visto qualcosa ma non l'ha assegnato
 * alla cella (problema di struttura della tabella, recuperabile da noi).
 */
export interface RecognizedWord {
  text: string;
  confidence: number;
  /** Centro della parola nelle coordinate della pagina restituite dall'OCR. */
  x: number;
  y: number;
  pageNumber: number;
}

export interface ExtractedTable {
  rowCount: number;
  columnCount: number;
  cells: TableCell[];
}

/** Contratto comune a qualunque provider in grado di estrarre tabelle da un file. */
export interface OcrProvider {
  extractTables(buffer: Buffer, mimeType: string): Promise<ExtractedTable[]>;
  /**
   * Le parole riconosciute nell'ULTIMA analisi effettuata, se il provider le
   * espone. Non costa nessuna chiamata in piu': sono dati che arrivano
   * insieme alle tabelle e che altrimenti verrebbero buttati via.
   */
  getLastRecognizedWords?(): RecognizedWord[];
}
