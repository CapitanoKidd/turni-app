/** Palette e spaziature condivise: layout semplice, poche scelte, alto contrasto. */
export const theme = {
  colors: {
    background: "#0F172A",
    surface: "#1E293B",
    surfaceAlt: "#273449",
    border: "#334155",
    text: "#F8FAFC",
    textMuted: "#94A3B8",
    primary: "#38BDF8",
    primaryText: "#04263A",
    danger: "#F87171",
    success: "#4ADE80",
  },
  radius: { sm: 8, md: 14, lg: 22 },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
} as const;

/** Palette di colori assegnati automaticamente ai nuovi tipi di turno. */
export const SHIFT_COLOR_PALETTE = [
  "#38BDF8", // azzurro
  "#FB923C", // arancio
  "#A78BFA", // viola
  "#4ADE80", // verde
  "#F472B6", // rosa
  "#FACC15", // giallo
  "#F87171", // rosso
  "#2DD4BF", // turchese
];

export function nextShiftColor(existingCount: number): string {
  return SHIFT_COLOR_PALETTE[existingCount % SHIFT_COLOR_PALETTE.length];
}
