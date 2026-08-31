/**
 * Aggiunge trasparenza a un colore esadecimale a 6 cifre (#RRGGBB ->
 * #RRGGBBAA): usato per ottenere una tinta tenue di sfondo dallo stesso
 * colore pieno assegnato a un tipo di turno (badge, celle del calendario),
 * senza dover mantenere una seconda palette "pastello" parallela a
 * SHIFT_COLOR_PALETTE.
 */
export function withAlpha(hex: string, alpha: number): string {
  const clamped = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
  const alphaHex = clamped.toString(16).padStart(2, "0");
  return `${hex}${alphaHex}`;
}
