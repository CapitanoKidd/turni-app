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
  staffName?: string,
  debug?: boolean,
  knownCells?: Record<string, string>,
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
  if (staffName) formData.append("staffName", staffName);
  if (debug) formData.append("debug", "true");
  // Simboli gia' imparati sul telefono: permettono al server di completare i
  // giorni il cui disegno non viene riconosciuto, senza nessun account e
  // senza che il server conservi niente.
  if (knownCells && Object.keys(knownCells).length > 0) {
    formData.append("knownCells", JSON.stringify(knownCells));
  }

  // Niente header Content-Type esplicito: fetch/FormData deve generarlo da
  // solo per includere il "boundary" del multipart. Impostandolo a mano si
  // rompe il parsing del file lato backend.
  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}/api/analyze`, {
      method: "POST",
      body: formData,
    });
  } catch {
    // fetch lancia solo per problemi di rete (offline, DNS, connessione
    // rifiutata): il server non e' mai stato raggiunto.
    throw new Error("Connessione assente o instabile: controlla la connessione e riprova.");
  }

  let payload: AnalyzeResponse;
  try {
    payload = (await response.json()) as AnalyzeResponse;
  } catch {
    throw new Error(GENERIC_ANALYSIS_ERROR);
  }

  if (!response.ok || !payload.success) {
    // 429 (troppe richieste) e 400 (validazione: file mancante, ecc.) sono
    // gia' messaggi scritti per essere letti dall'utente. Tutto il resto
    // (500 con dettagli tecnici di Azure, 503 di servizio non disponibile)
    // non e' azionabile da chi carica il documento: meglio un messaggio
    // unico e comprensibile che un errore tecnico che non puo' risolvere.
    if (response.status === 429 || response.status === 400) {
      throw new Error(payload.error ?? "Richiesta non valida.");
    }
    throw new Error(GENERIC_ANALYSIS_ERROR);
  }
  return payload;
}

const GENERIC_ANALYSIS_ERROR =
  "Mi dispiace, non sono riuscito ad analizzare il tuo documento. Prova con un'immagine o un PDF più leggibile.";
