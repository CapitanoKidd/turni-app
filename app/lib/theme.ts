/**
 * Palette, tipografia e ombre condivise. Tema chiaro: verde foresta profondo
 * come accento (CTA, pillola attiva, badge), sfondo verde-menta chiarissimo,
 * card leggermente più tinte dello sfondo invece che bianche piatte.
 */
export const theme = {
  colors: {
    background: "#EEF4EF",
    surface: "#FFFFFF",
    surfaceAlt: "#E9F1EA",
    surfaceTint: "#E1EBE2",
    surfaceElevated: "#FFFFFF",
    border: "#D9E5DB",
    borderStrong: "#C1D4C5",
    text: "#16221B",
    textMuted: "#5C6F62",
    textFaint: "#8FA396",
    primary: "#146C54",
    primaryDark: "#0F5443",
    primaryMuted: "#DBEEE3",
    primaryText: "#FFFFFF",
    danger: "#D0554F",
    dangerMuted: "#F7E1DF",
    success: "#2F9E64",
    successMuted: "#DCF3E5",
    warning: "#C0821E",
    warningMuted: "#F5E7CC",
  },
  /** Solo per la card del calendario mensile: sfondo verde scuro invece del chiaro usato ovunque nell'app, richiesto esplicitamente per distinguerlo dal resto e dargli piu' carattere. Di conseguenza testo/bordi qui sono chiari, non scuri come nel resto del tema. */
  calendar: {
    background: "#123F32",
    cellIdle: "rgba(255,255,255,0.08)",
    border: "rgba(255,255,255,0.16)",
    text: "#FFFFFF",
    textMuted: "rgba(255,255,255,0.68)",
    textFaint: "rgba(255,255,255,0.42)",
  },
  radius: { sm: 12, md: 18, lg: 26, pill: 999 },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  /** I 5 pesi caricati di Baloo 2 (vedi useFonts in app/_layout.tsx): con un font su misura si usa SEMPRE fontFamily, mai fontWeight (sarebbero pesi diversi dello stesso font di sistema, qui sono file separati). */
  font: {
    regular: "Baloo2_400Regular",
    medium: "Baloo2_500Medium",
    semiBold: "Baloo2_600SemiBold",
    bold: "Baloo2_700Bold",
    extraBold: "Baloo2_800ExtraBold",
  },
  typography: {
    title: { fontSize: 26, fontFamily: "Baloo2_800ExtraBold" as const, letterSpacing: -0.3 },
    heading: { fontSize: 19, fontFamily: "Baloo2_700Bold" as const, letterSpacing: -0.2 },
    subheading: { fontSize: 16, fontFamily: "Baloo2_700Bold" as const },
    body: { fontSize: 15, fontFamily: "Baloo2_500Medium" as const, lineHeight: 21 },
    label: { fontSize: 11, fontFamily: "Baloo2_700Bold" as const, letterSpacing: 0.6, textTransform: "uppercase" as const },
    caption: { fontSize: 12, fontFamily: "Baloo2_500Medium" as const },
  },
  shadow: {
    card: {
      shadowColor: "#0E3327",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 10,
      elevation: 2,
    },
    elevated: {
      shadowColor: "#0E3327",
      shadowOffset: { width: 0, height: 14 },
      shadowOpacity: 0.16,
      shadowRadius: 28,
      elevation: 10,
    },
  },
} as const;

/** Palette di colori assegnati automaticamente ai nuovi tipi di turno. Ogni colore serve sia da tinta piena (pallini, bordo "oggi") sia da coppia tenue-sfondo/testo-pieno per badge e celle (vedi lib/color.ts). */
export const SHIFT_COLOR_PALETTE = [
  "#2F8F72", // verde smeraldo
  "#C97A3D", // terracotta
  "#6E6FC9", // indaco
  "#3D9BB8", // azzurro petrolio
  "#C15A87", // magenta polveroso
  "#B8A23D", // senape
  "#C0554F", // rosso mattone
  "#4D9E8F", // turchese
];

export function nextShiftColor(existingCount: number): string {
  return SHIFT_COLOR_PALETTE[existingCount % SHIFT_COLOR_PALETTE.length];
}
