/**
 * Palette, tipografia e ombre condivise. Tema scuro con più livelli di
 * profondità (sfondo / superficie / superficie sollevata) invece di un
 * unico grigio piatto ovunque, così le card e i modali si staccano dallo
 * sfondo invece di sembrare tutti sullo stesso piano.
 */
export const theme = {
  colors: {
    background: "#0A0F1D",
    surface: "#141C2E",
    surfaceAlt: "#1C2740",
    surfaceElevated: "#1B2540",
    border: "#232E45",
    borderStrong: "#2E3B57",
    text: "#F5F7FB",
    textMuted: "#93A0BD",
    textFaint: "#5C6989",
    primary: "#3BC5F6",
    primaryMuted: "#0E2C42",
    primaryText: "#03202F",
    danger: "#F87171",
    dangerMuted: "#3A1B1E",
    success: "#4ADE80",
    successMuted: "#0F3324",
    warning: "#FBBF24",
    warningMuted: "#3A2C0E",
  },
  radius: { sm: 10, md: 16, lg: 24, pill: 999 },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  typography: {
    title: { fontSize: 28, fontWeight: "800", letterSpacing: -0.4 },
    heading: { fontSize: 19, fontWeight: "700", letterSpacing: -0.2 },
    subheading: { fontSize: 15, fontWeight: "700" },
    body: { fontSize: 15, fontWeight: "400", lineHeight: 21 },
    label: { fontSize: 11, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" },
    caption: { fontSize: 12, fontWeight: "500" },
  },
  shadow: {
    card: {
      shadowColor: "#000814",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.28,
      shadowRadius: 14,
      elevation: 5,
    },
    elevated: {
      shadowColor: "#000814",
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.4,
      shadowRadius: 24,
      elevation: 12,
    },
  },
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
