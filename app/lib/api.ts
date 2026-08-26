import Constants from "expo-constants";
import type { AnalyzeResponse } from "./types";

/**
 * URL del backend. In sviluppo si puo' sovrascrivere con la variabile
 * EXPO_PUBLIC_API_BASE_URL (es. http://192.168.1.x:3000 per testare su
 * device fisico), altrimenti si usa il valore di default in app.json.
 */
function getApiBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (fromEnv) return fromEnv;
  const fromConfig = Constants.expoConfig?.extra?.apiBaseUrl;
  return typeof fromConfig === "string" ? fromConfig : "http://localhost:3000";
}

export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
}

/**
 * Invia il file al backend per l'analisi. Il file non viene mai scritto
 * da nessuna parte lato app: viene letto dal picker e spedito direttamente.
 */
export async function analyzeShiftFile(
  file: PickedFile,
  target: { month: number; year: number },
): Promise<AnalyzeResponse> {
  const formData = new FormData();
  // React Native accetta questa forma per gli upload multipart.
  formData.append("file", {
    uri: file.uri,
    name: file.name,
    type: file.mimeType,
  } as unknown as Blob);
  formData.append("month", String(target.month));
  formData.append("year", String(target.year));

  // Niente header Content-Type esplicito: fetch/FormData deve generarlo da
  // solo per includere il "boundary" del multipart. Impostandolo a mano si
  // rompe il parsing del file lato backend.
  const response = await fetch(`${getApiBaseUrl()}/api/analyze`, {
    method: "POST",
    body: formData,
  });

  const payload = (await response.json()) as AnalyzeResponse;
  if (!response.ok || !payload.success) {
    throw new Error(payload.error ?? "Analisi del documento fallita.");
  }
  return payload;
}
