import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExtractedTable, TableCell } from "../services/ocr/types.js";
import { parseShiftGrid } from "../services/shiftGridParser.js";

const TARGET_2026_08 = { year: 2026, month1To12: 8 };

/** Tabella "turnistica" a due righe: giorni del mese in una riga, un dipendente per riga di dati. */
function buildRosterTable(rows: Array<{ name: string; codes: string[] }>, headerRow = 0): ExtractedTable {
  const totalDays = rows[0]?.codes.length ?? 31;
  const header: TableCell[] = Array.from({ length: totalDays }, (_, i) => ({
    rowIndex: headerRow,
    columnIndex: i + 1,
    text: String(i + 1),
  }));

  const dataCells: TableCell[] = rows.flatMap((row, rowOffset) => {
    const rowIndex = headerRow + 1 + rowOffset;
    return [
      { rowIndex, columnIndex: 0, text: row.name },
      ...row.codes.map((code, i) => ({ rowIndex, columnIndex: i + 1, text: code })),
    ];
  });

  return { rowCount: headerRow + 1 + rows.length, columnCount: totalDays + 1, cells: [...header, ...dataCells] };
}

describe("parseShiftGrid — turnistica multi-persona", () => {
  it("assegna a ogni dipendente solo la propria riga", async () => {
    const table = buildRosterTable([
      { name: "Aitoro Monica", codes: Array.from({ length: 31 }, (_, i) => (i % 2 === 0 ? "M" : "P")) },
      { name: "Vannucci M. Cristina", codes: Array.from({ length: 31 }, () => "R") },
    ]);

    const monica = parseShiftGrid([table], TARGET_2026_08, "Monica Aitoro");
    assert.equal(monica.detectedShifts.length, 31);
    assert.equal(monica.detectedShifts[0].rawCode, "M");

    const cristina = parseShiftGrid([table], TARGET_2026_08, "Cristina Vannucci");
    assert.equal(cristina.detectedShifts.length, 31);
    assert.equal(cristina.detectedShifts[0].rawCode, "R");
  });

  it("restituisce candidateNames invece di indovinare quando il nome non e' fornito", () => {
    const table = buildRosterTable([
      { name: "Aitoro Monica", codes: Array.from({ length: 31 }, () => "M") },
      { name: "Vannucci M. Cristina", codes: Array.from({ length: 31 }, () => "R") },
    ]);
    const result = parseShiftGrid([table], TARGET_2026_08, undefined);
    assert.equal(result.detectedShifts.length, 0);
    assert.deepEqual(new Set(result.candidateNames), new Set(["Aitoro Monica", "Vannucci M. Cristina"]));
  });

  it("gestisce intestazioni miste (giorno della settimana + numero nella stessa cella), annotazioni sotto al codice e trattini per 'nessun turno'", () => {
    const weekdays = ["Sa", "So", "Mo", "Di", "Mi", "Do", "Fr"];
    const headerRow = 3;
    const header: TableCell[] = Array.from({ length: 31 }, (_, i) => ({
      rowIndex: headerRow,
      columnIndex: i + 2,
      text: `${weekdays[i % 7]}\n${String(i + 1).padStart(2, "0")}`,
    }));
    // settimana fuori range (32-36): non deve mai essere scambiata per la riga dei giorni
    const weekNumberRow: TableCell[] = [32, 33, 34, 35, 36].map((w, i) => ({
      rowIndex: headerRow - 1,
      columnIndex: 2 + i * 7,
      text: String(w),
    }));
    const sectionRow: TableCell[] = [{ rowIndex: headerRow + 1, columnIndex: 0, text: "Leitende" }];
    const codes = [
      "1\n4O", "1\n4O", "–", "–", "–", "1", "1", "2V", "2V", "–", "3", "3", "3V", "3V", "–", "–",
      "F", "F", "F", "F", "–", "2", "2", "–", "2V", "2V", "2", "–", "3", "3", "3V",
    ];
    const dataRow: TableCell[] = [
      { rowIndex: headerRow + 2, columnIndex: 0, text: "Aitoro Monica" },
      { rowIndex: headerRow + 2, columnIndex: 1, text: "100 M" },
      ...codes.map((c, i) => ({ rowIndex: headerRow + 2, columnIndex: i + 2, text: c })),
    ];

    const table: ExtractedTable = {
      rowCount: headerRow + 3,
      columnCount: 33,
      cells: [...weekNumberRow, ...header, ...sectionRow, ...dataRow],
    };

    const result = parseShiftGrid([table], TARGET_2026_08, "Monica Aitoro");

    assert.equal(result.detectedShifts.length, 22, "3 giorni con trattino non devono generare un turno finto");
    assert.equal(result.detectedShifts.find((s) => s.date === "2026-08-03"), undefined);
    assert.equal(result.detectedShifts.find((s) => s.date === "2026-08-01")?.rawCode, "1", "l'annotazione '4O' non deve finire nel codice");
  });

  it("recupera i giorni spezzati su una riga di intestazione diversa (caso reale: weekend/lunedi' fusi con il numero di settimana)", () => {
    // Struttura osservata davvero da Azure su un documento reale: la riga
    // "principale" dei giorni (con la sequenza piu' lunga, qui i giorni
    // dispari) ha dei buchi per i giorni pari, che finiscono invece su una
    // riga diversa sopra, a volte fusi col numero di settimana (es. "33 10").
    const mainRow: TableCell[] = []; // riga "principale" trovata da findDayAxis: serve una sequenza lunga e consecutiva
    const auxRow: TableCell[] = []; // riga ausiliaria sopra, dove finiscono i giorni "spaiati"
    for (let day = 1; day <= 31; day++) {
      const columnIndex = day + 2; // colonne 0-1 riservate a nome/percentuale
      if (day <= 20) {
        mainRow.push({ rowIndex: 2, columnIndex, text: String(day) });
      } else if (day === 24) {
        auxRow.push({ rowIndex: 0, columnIndex, text: "35 Mo 24" }); // caso "fuso" col numero di settimana
      } else {
        auxRow.push({ rowIndex: 0, columnIndex, text: `Xx ${String(day).padStart(2, "0")}` });
      }
    }
    // Colonna di riepilogo fuori dalla griglia dei giorni: non deve MAI essere scambiata per un giorno.
    const summaryColumn: TableCell = { rowIndex: 2, columnIndex: 40, text: "Soll Aug.26" };

    const dataRow: TableCell[] = [
      { rowIndex: 3, columnIndex: 0, text: "Mario Rossi" },
      ...Array.from({ length: 31 }, (_, i) => ({ rowIndex: 3, columnIndex: i + 3, text: "M" })),
    ];

    const table: ExtractedTable = {
      rowCount: 4,
      columnCount: 41,
      cells: [...auxRow, ...mainRow, summaryColumn, ...dataRow],
    };

    const result = parseShiftGrid([table], TARGET_2026_08, "Mario Rossi");

    assert.equal(result.detectedShifts.length, 31, "tutti i 31 giorni devono essere recuperati, non solo quelli sulla riga principale");

    const day26 = result.detectedShifts.filter((s) => s.date === "2026-08-26");
    assert.equal(day26.length, 1, "la colonna di riepilogo 'Soll Aug.26' non deve creare un turno duplicato per il 26");
    assert.equal(day26[0].rawCode, "M");

    const day24 = result.detectedShifts.find((s) => s.date === "2026-08-24");
    assert.equal(day24?.rawCode, "M", "il giorno fuso col numero di settimana ('35 Mo 24') deve comunque essere riconosciuto");

    const dates = result.detectedShifts.map((s) => s.date);
    const sortedDates = [...dates].sort();
    assert.deepEqual(dates, sortedDates, "i turni devono uscire in ordine di data, non nell'ordine in cui le colonne sono state unite");
  });
});
