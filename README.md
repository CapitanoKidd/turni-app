# Turni App

App per leggere la griglia dei turni (foto, PDF o Word), farla analizzare
automaticamente, importare i turni nel calendario del mese e — se lo scegli —
impostare in automatico la sveglia per ogni turno.

Struttura del repository:

```
app/       Applicazione mobile (Expo / React Native + TypeScript)
backend/   Backend stateless (Node + Express + TypeScript) che parla con Azure
```

Nessun account, nessun login: le impostazioni e i turni restano solo sul
telefono. Il backend non salva mai i file caricati: li elabora in memoria e
li scarta subito dopo aver estratto i turni.

## 1. Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Parte in ascolto su `http://localhost:3000` con `MOCK_OCR=true`: risponde
con dati di esempio, cosi' puoi provare tutto il flusso dell'app (carica →
rivedi → importa → sveglie) senza avere ancora una chiave Azure.

Quando la chiave sara' disponibile, in `backend/.env`:

```
MOCK_OCR=false
AZURE_DOCINTEL_ENDPOINT=https://<risorsa>.cognitiveservices.azure.com
AZURE_DOCINTEL_KEY=<chiave>
```

Nessun'altra modifica al codice e' necessaria: il provider Azure e' gia'
cablato dietro un'interfaccia comune (`backend/src/services/ocr/types.ts`),
quindi in futuro si puo' anche sostituire con un altro servizio senza toccare
il resto del backend.

### Come funziona l'analisi

- **Foto / PDF** → inviati ad Azure AI Document Intelligence (modello
  `prebuilt-layout`), che individua le tabelle nel documento.
- **Word (.docx)** → le tabelle vengono lette direttamente dal file, senza
  bisogno di OCR (piu' preciso e non consuma chiamate Azure).
- In entrambi i casi il risultato passa da `shiftGridParser.ts`, che prova a
  riconoscere i numeri dei giorni del mese e il codice turno associato. E'
  un'euristica v1: quando la copertura e' bassa restituisce un `warning` e
  l'app chiede all'utente di completare a mano i giorni mancanti.

## 2. App mobile

```bash
cd app
npm install
npx expo start
```

Per testare su un telefono fisico (non l'emulatore), il backend deve essere
raggiungibile dalla rete del telefono. Avvia l'app con:

```bash
EXPO_PUBLIC_API_BASE_URL=http://<ip-del-tuo-pc>:3000 npx expo start
```

### Note sulle sveglie

Le "sveglie" sono notifiche locali programmate (`expo-notifications`), non
un vero allarme di sistema: suonano e vibrano anche a schermo bloccato, ma
non forzano il volume se il telefono e' silenzioso. E' la soluzione piu'
semplice da pubblicare subito su Play Store; se in futuro serve una sveglia
"vera" (stile app Sveglia, volume forzato, schermo intero) si puo' aggiungere
un modulo nativo dedicato senza riscrivere il resto dell'app.

## 3. Pubblicazione su Google Play

1. Crea un account Google Play Developer (una tantum, $25).
2. `npm install -g eas-cli` poi `eas login`.
3. `cd app && eas build --platform android --profile production` per generare
   l'Android App Bundle.
4. `eas submit --platform android` per caricarlo su Play Console (oppure
   caricamento manuale la prima volta).
5. Aggiorna `app.json` con il vero `android.package` (identificatore univoco,
   es. `com.tuonome.turni`) prima della prima build di produzione.

## Alternative ad Azure AI Document Intelligence

Il backend isola l'OCR dietro un'interfaccia (`OcrProvider`), quindi cambiare
fornitore in futuro e' un cambiamento contenuto. Alternative da considerare:

- **Google Cloud Document AI** — qualita' di riconoscimento tabelle simile ad
  Azure, prezzi comparabili a basso volume.
- **AWS Textract** — molto valido per tabelle, spesso il piu' economico a
  basso volume (poche pagine al mese per utente).
- **Tesseract self-hosted** — gratuito, ma riconoscimento tabelle/manoscritto
  nettamente meno affidabile: sconsigliato come motore principale, utile solo
  come fallback economico.

Per l'uso previsto (un caricamento al mese per utente, un solo file), il
piano gratuito di Azure Document Intelligence (500 pagine/mese) probabilmente
copre gia' un buon numero di utenti senza costi.
