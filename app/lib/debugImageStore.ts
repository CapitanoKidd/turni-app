/**
 * Passaggio "in memoria" delle immagini di debug dalla Home alla schermata
 * di debug-info: possono pesare diversi MB come stringa base64, troppo per
 * passarle come parametro di navigazione (pensato per stringhe brevi). Dato
 * che si tratta sempre e solo dell'ultima analisi appena fatta nella stessa
 * sessione dell'app, basta una variabile di modulo — nessun bisogno di
 * salvarle su disco (i file caricati non vengono mai persistiti).
 */
let lastDebugImages: string[] = [];

export function setDebugImages(images: string[]): void {
  lastDebugImages = images;
}

export function getDebugImages(): string[] {
  return lastDebugImages;
}
