import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findStaffPage } from "../services/findStaffPage.js";
import { makeTestPdf } from "./fixtures/testPdf.js";

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
