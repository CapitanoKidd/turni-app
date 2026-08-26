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
}

export interface ExtractedTable {
  rowCount: number;
  columnCount: number;
  cells: TableCell[];
}

/** Contratto comune a qualunque provider in grado di estrarre tabelle da un file. */
export interface OcrProvider {
  extractTables(buffer: Buffer, mimeType: string): Promise<ExtractedTable[]>;
}
