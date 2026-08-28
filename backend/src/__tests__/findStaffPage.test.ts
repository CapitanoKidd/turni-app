import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findStaffPage, findStaffRowBand } from "../services/findStaffPage.js";
import { makeTestPdf } from "./fixtures/testPdf.js";

/** Righe di intestazione + dati come le avrebbe un vero PDF vettoriale: ogni numero/nome e' un elemento di testo separato. */
function rosterPage(names: string[]) {
  const dayHeader = Array.from({ length: 10 }, (_, i) => String(i + 1).padStart(2, "0"));
  return {
    lines: [
      "Turnistica Agosto 2026",
      dayHeader,
      ...names.map((name) => [name, ...Array.from({ length: 10 }, () => "M")]),
    ],
  };
}

describe("findStaffPage", () => {
  it("trova la pagina giusta quando il nome compare (nessuna chiamata Azure)", async () => {
    const pdf = await makeTestPdf([
      { lines: ["Turni Agosto 2026", "Mario Rossi", "1 2 3 M P N"] },
      { lines: ["Turni Agosto 2026", "Luigi Verdi", "1 2 3 R R M"] },
    ]);

    const match = await findStaffPage(pdf, "Luigi Verdi");
    assert.ok(match, "doveva trovare una pagina");
    assert.equal(match?.pageIndex, 1);
  });

  it("restituisce null se il nome non compare in nessuna pagina", async () => {
    const pdf = await makeTestPdf([{ lines: ["Mario Rossi"] }, { lines: ["Luigi Verdi"] }]);
    const match = await findStaffPage(pdf, "Nome Che Non Esiste Da Nessuna Parte");
    assert.equal(match, null);
  });

  it("restituisce null se il PDF non ha testo estraibile (pagina senza righe, come una scansione)", async () => {
    const pdf = await makeTestPdf([{ lines: [] }, { lines: [] }]);
    const match = await findStaffPage(pdf, "Mario Rossi");
    assert.equal(match, null);
  });

  it("restituisce null se non viene fornito nessun nome utente", async () => {
    const pdf = await makeTestPdf([{ lines: ["Mario Rossi"] }]);
    const match = await findStaffPage(pdf, undefined);
    assert.equal(match, null);
  });
});

describe("findStaffRowBand", () => {
  it("trova la fascia intestazione + riga quando entrambe sono individuabili", async () => {
    const pdf = await makeTestPdf([rosterPage(["Anna Bianchi", "Mario Rossi", "Luigi Verdi"])]);

    const band = await findStaffRowBand(pdf, 0, "Mario Rossi");

    assert.ok(band, "doveva trovare la fascia");
    assert.ok(band.rowTopPdfY > band.rowBottomPdfY, "la fascia riga deve avere un'estensione positiva");
    // L'intestazione (numeri di giorno) sta piu' in alto nella pagina (y pdf
    // maggiore) della riga dati trovata: il fondo dell'intestazione deve
    // restare sopra la fascia della riga.
    assert.ok(band.headerBottomPdfY > band.rowTopPdfY, "l'intestazione deve restare sopra la fascia della riga");
  });

  it("restituisce null se la pagina non ha una riga di intestazione con abbastanza numeri di giorno", async () => {
    const pdf = await makeTestPdf([{ lines: ["Mario Rossi", "1 2 3 M P N"] }]);
    const band = await findStaffRowBand(pdf, 0, "Mario Rossi");
    assert.equal(band, null);
  });

  it("restituisce null se il nome non compare sulla pagina", async () => {
    const pdf = await makeTestPdf([rosterPage(["Anna Bianchi", "Luigi Verdi"])]);
    const band = await findStaffRowBand(pdf, 0, "Nome Che Non Esiste");
    assert.equal(band, null);
  });

  it("restituisce null se non viene fornito nessun nome utente", async () => {
    const pdf = await makeTestPdf([rosterPage(["Mario Rossi"])]);
    const band = await findStaffRowBand(pdf, 0, undefined);
    assert.equal(band, null);
  });

  it("non scambia una riga di turni con tanti codici numerici per l'intestazione (caso reale trovato su un documento vero)", async () => {
    // Molti codici turno sono numeri singoli ("1", "2", "3"...): una riga
    // dati puo' avere 5+ token che sembrano numeri di giorno senza esserlo.
    // Qui la riga "decoy" e' proprio sopra quella del dipendente cercato,
    // come e' successo davvero su un documento reale.
    // Ogni riga e' 20 punti pdf sotto la precedente (vedi makeTestPdf):
    // titolo y=370, intestazione vera y=350, riga decoy y=330, riga cercata y=310.
    const dayHeader = Array.from({ length: 10 }, (_, i) => String(i + 1).padStart(2, "0"));
    const decoyRow = ["Decoy Persona", "1", "1", "3", "3", "3", "3", "1", "1", "1", "2"];
    const targetRow = ["Mario Rossi", ...Array.from({ length: 10 }, () => "M")];

    const pdf = await makeTestPdf([{ lines: ["Turnistica Agosto 2026", dayHeader, decoyRow, targetRow] }]);

    const band = await findStaffRowBand(pdf, 0, "Mario Rossi");

    assert.ok(band, "doveva trovare la fascia nonostante la riga decoy");
    // Deve aver scelto la riga di intestazione vera (y=350), non quella
    // decoy (y=330) solo perche' ha tanti token che sembrano numeri.
    assert.ok(
      band.headerBottomPdfY > 340,
      `l'intestazione trovata deve essere quella vera (y=350), non la riga decoy (y=330): ${band.headerBottomPdfY}`,
    );
  });
});
