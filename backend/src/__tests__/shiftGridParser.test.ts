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
});
