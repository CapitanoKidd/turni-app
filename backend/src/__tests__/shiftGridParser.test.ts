import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExtractedTable, TableCell } from "../services/ocr/types.js";
import { parseShiftGrid, withEveryDayOfMonth } from "../services/shiftGridParser.js";

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

  it("gestisce intestazioni miste (giorno della settimana + numero nella stessa cella), annotazioni sotto al codice e trattini passati cosi' come sono", () => {
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

    assert.equal(result.detectedShifts.length, 31, "anche i giorni con trattino vanno riconosciuti: sara' l'utente a definirli (es. come riposo)");
    assert.equal(result.detectedShifts.find((s) => s.date === "2026-08-03")?.rawCode, "–", "il trattino va passato cosi' com'e', non scartato");
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

  it("non scambia le colonne di riepilogo mensile per tipo di turno (M/P/N/S/R/RO/CO/CS) per intestazioni di giorno (bug reale: il turno del giorno 1 veniva sostituito dal conteggio mensile)", () => {
    // Documento reale: dopo l'ultima colonna dei giorni (31) seguono, sulla
    // stessa riga di intestazione o una vicina (dentro la finestra cercata
    // per recuperare i giorni spezzati), le colonne "M P N S R RO CO CS" con
    // i conteggi mensili per tipo di turno di quel dipendente — numeri da
    // 1 a 31 anche loro, quindi candidati a essere scambiati per giorni.
    const dayHeader: TableCell[] = Array.from({ length: 31 }, (_, i) => ({
      rowIndex: 3,
      columnIndex: i + 2,
      text: String(i + 1),
    }));
    // Riga di riepilogo, nella finestra di intestazione: conteggi che
    // COINCIDONO con giorni della griglia (7, 3, 1, 6 sono tutti <= 31).
    const totalsRow: TableCell[] = [
      { rowIndex: 2, columnIndex: 34, text: "7" }, // M
      { rowIndex: 2, columnIndex: 35, text: "7" }, // P
      { rowIndex: 2, columnIndex: 36, text: "3" }, // N
      { rowIndex: 2, columnIndex: 37, text: "7" }, // S
      { rowIndex: 2, columnIndex: 38, text: "1" }, // R
      { rowIndex: 2, columnIndex: 39, text: "6" }, // RO
      { rowIndex: 2, columnIndex: 40, text: "6" }, // CO
      { rowIndex: 2, columnIndex: 41, text: "6" }, // CS
    ];
    // Turni reali del dipendente: CO per tutto agosto, tranne un paio di
    // giorni facilmente distinguibili, cosi' un giorno "rubato" dal
    // riepilogo si nota subito.
    const codes = Array.from({ length: 31 }, (_, i) => (i === 8 ? "M" : "CO"));
    const dataRow: TableCell[] = [
      { rowIndex: 4, columnIndex: 0, text: "Vannucci M. Cristina" },
      ...codes.map((code, i) => ({ rowIndex: 4, columnIndex: i + 2, text: code })),
      // Stessi conteggi anche sulla riga del dipendente (colonne di riepilogo per riga, non solo per colonna).
      { rowIndex: 4, columnIndex: 34, text: "6" },
      { rowIndex: 4, columnIndex: 35, text: "4" },
      { rowIndex: 4, columnIndex: 36, text: "4" },
      { rowIndex: 4, columnIndex: 37, text: "4" },
      { rowIndex: 4, columnIndex: 38, text: "6" },
      { rowIndex: 4, columnIndex: 39, text: "0" },
      { rowIndex: 4, columnIndex: 40, text: "7" },
      { rowIndex: 4, columnIndex: 41, text: "0" },
    ];

    const table: ExtractedTable = {
      rowCount: 5,
      columnCount: 42,
      cells: [...dayHeader, ...totalsRow, ...dataRow],
    };

    const result = parseShiftGrid([table], TARGET_2026_08, "Vannucci M. Cristina");

    assert.equal(result.detectedShifts.length, 31);
    assert.equal(result.detectedShifts.find((s) => s.date === "2026-08-01")?.rawCode, "CO", "il giorno 1 non deve prendere il conteggio mensile dei turni R");
    assert.equal(result.detectedShifts.find((s) => s.date === "2026-08-03")?.rawCode, "CO", "il giorno 3 non deve prendere il conteggio mensile dei turni N");
    assert.equal(result.detectedShifts.find((s) => s.date === "2026-08-06")?.rawCode, "CO", "il giorno 6 non deve prendere il conteggio mensile dei turni RO");
    assert.equal(result.detectedShifts.find((s) => s.date === "2026-08-07")?.rawCode, "CO", "il giorno 7 non deve prendere il conteggio mensile dei turni M");
    assert.equal(result.detectedShifts.find((s) => s.date === "2026-08-09")?.rawCode, "M", "il vero turno M del giorno 9 resta quello");
  });

  it("riconosce l'intestazione anche quando Azure fonde piu' giorni in un'unica cella con columnSpan (documento reale: turnistica tedesca densa)", () => {
    // Caso reale osservato in debug: l'intestazione di ottobre arriva con
    // alcune celle a un giorno per colonna ("Fr 09", columnSpan assente = 1)
    // e altre che fondono PIU' giorni in una sola cella che dichiara di
    // occupare piu' colonne (es. "Oktober 2026 Do Fr Sa So 01 02 03 04",
    // columnSpan 4: i giorni 1-4). Senza distribuire i numeri di quelle
    // celle sulle colonne che dichiarano di occupare, la riga di
    // intestazione non raggiungeva mai una sequenza consecutiva abbastanza
    // lunga da essere riconosciuta (bug reale: copertura 13%, "nessuna
    // turnistica riconosciuta").
    // columnIndex = giorno + 1 (stesso offset della riga dati sotto), con
    // buchi alle colonne 9 e 23: come nel documento reale, i giorni 8 e 22
    // non hanno affatto una cella su questa riga (finiscono su una riga
    // ausiliaria diversa, che qui non serve simulare: bastano a dimostrare
    // il fix anche senza, la copertura resta comunque ottima).
    const header: TableCell[] = [
      { rowIndex: 0, columnIndex: 2, text: "Oktober 2026 Do Fr Sa So 01 02 03 04", columnSpan: 4 }, // giorni 1-4
      { rowIndex: 0, columnIndex: 6, text: "41 Mo 05" },
      { rowIndex: 0, columnIndex: 7, text: "Di Mi 06 07", columnSpan: 2 }, // giorni 6-7 (giorno 8 assente, come nel documento reale)
      { rowIndex: 0, columnIndex: 10, text: "Fr 09" },
      { rowIndex: 0, columnIndex: 11, text: "Sa 10" },
      { rowIndex: 0, columnIndex: 12, text: "So 11" },
      { rowIndex: 0, columnIndex: 13, text: "42 Mo Di Mi 12 13 14", columnSpan: 3 },
      { rowIndex: 0, columnIndex: 16, text: "Do 15" },
      { rowIndex: 0, columnIndex: 17, text: "Fr 16" },
      { rowIndex: 0, columnIndex: 18, text: "Sa 17" },
      { rowIndex: 0, columnIndex: 19, text: "So 18" },
      { rowIndex: 0, columnIndex: 20, text: "43 Mo Di Mi 19 20 21", columnSpan: 3 },
      { rowIndex: 0, columnIndex: 24, text: "Fr 23" }, // giorno 22 assente, come nel documento reale
      { rowIndex: 0, columnIndex: 25, text: "Sa 24" },
      { rowIndex: 0, columnIndex: 26, text: "So 25" },
      { rowIndex: 0, columnIndex: 27, text: "44 Mo Di Mi 26 27 28", columnSpan: 3 },
      { rowIndex: 0, columnIndex: 30, text: "Do 29" },
      { rowIndex: 0, columnIndex: 31, text: "Fr Sa 30 31", columnSpan: 2 },
    ];
    const codes = Array.from({ length: 31 }, (_, i) => (i === 8 ? "1" : "2V"));
    const dataRow: TableCell[] = [
      { rowIndex: 1, columnIndex: 0, text: "Palumbo Renato" },
      ...codes.map((code, i) => ({ rowIndex: 1, columnIndex: i + 2, text: code })),
    ];

    const table: ExtractedTable = { rowCount: 2, columnCount: 34, cells: [...header, ...dataRow] };
    const target = { year: 2026, month1To12: 10 };
    const result = parseShiftGrid([table], target, "Renato Palumbo");

    assert.equal(result.detectedShifts.length, 31, "la riga dell'intestazione va riconosciuta: tutti i 31 giorni di ottobre devono uscire");
    assert.equal(result.detectedShifts.find((s) => s.date === "2026-10-01")?.rawCode, "2V", "giorno dentro la cella fusa a 4 colonne");
    assert.equal(result.detectedShifts.find((s) => s.date === "2026-10-06")?.rawCode, "2V", "giorno dentro la cella fusa a 2 colonne");
    assert.equal(result.detectedShifts.find((s) => s.date === "2026-10-09")?.rawCode, "1", "il vero turno del giorno 9 (cella singola) resta quello");
    assert.equal(result.detectedShifts.find((s) => s.date === "2026-10-31")?.rawCode, "2V", "ultimo giorno, dentro l'ultima cella fusa a 2 colonne");
  });

  it("deduce per posizione i giorni la cui intestazione e' illeggibile quella volta (Azure non legge sempre l'header allo stesso modo)", () => {
    // Stesso documento, due chiamate diverse ad Azure: la seconda volta i
    // giorni 3 e 4 vengono fusi con il numero di settimana in una cella
    // unica illeggibile ("2026 32 Mo Di 03 04"), invece di restare separati
    // come la prima volta. Le righe con i turni veri restano identiche.
    // Giorni 1,2 e poi 5-12 in chiaro (una sequenza consecutiva abbastanza
    // lunga da farla riconoscere come riga dei giorni), 3 e 4 mancanti li'
    // perche' fusi altrove in una cella illeggibile.
    const header: TableCell[] = [1, 2, 5, 6, 7, 8, 9, 10, 11, 12].map((day) => ({
      rowIndex: 2,
      columnIndex: day + 2,
      text: String(day),
    }));
    header.push({ rowIndex: 0, columnIndex: 5, text: "2026 32 Mo Di 03 04" }); // giorni 3 e 4 fusi, illeggibili

    const dataRow: TableCell[] = [
      { rowIndex: 3, columnIndex: 0, text: "Mario Rossi" },
      ...Array.from({ length: 7 }, (_, i) => ({ rowIndex: 3, columnIndex: i + 3, text: "M" })),
    ];

    const table: ExtractedTable = { rowCount: 4, columnCount: 10, cells: [...header, ...dataRow] };
    const result = parseShiftGrid([table], TARGET_2026_08, "Mario Rossi");

    assert.equal(result.detectedShifts.length, 7, "anche i giorni 3 e 4, la cui intestazione e' illeggibile, vanno dedotti dalla posizione");
    assert.ok(result.detectedShifts.some((s) => s.date === "2026-08-03"));
    assert.ok(result.detectedShifts.some((s) => s.date === "2026-08-04"));
  });
});

describe("withEveryDayOfMonth", () => {
  it("riempie i giorni mancanti con rawCode vuoto, senza toccare quelli gia' trovati", () => {
    const found = [
      { date: "2026-08-05", rawCode: "M", confidence: 0.85 },
      { date: "2026-08-01", rawCode: "-", confidence: 0.85 },
    ];

    const result = withEveryDayOfMonth(found, { year: 2026, month1To12: 8 });

    assert.equal(result.length, 31, "agosto ha 31 giorni: devono esserci tutti, anche quelli non trovati");
    assert.deepEqual(
      result.map((s) => s.date),
      result
        .map((s) => s.date)
        .slice()
        .sort(),
      "i giorni devono restare in ordine di data",
    );

    const day1 = result.find((s) => s.date === "2026-08-01");
    assert.equal(day1?.rawCode, "-", "un giorno gia' trovato non va sovrascritto");

    const day2 = result.find((s) => s.date === "2026-08-02");
    assert.equal(day2?.rawCode, "", "un giorno non trovato deve comparire comunque, con rawCode vuoto");

    const day31 = result.find((s) => s.date === "2026-08-31");
    assert.equal(day31?.rawCode, "", "anche l'ultimo giorno del mese deve comparire se non trovato");
  });

  it("non aggiunge o perde giorni quando sono gia' tutti presenti", () => {
    const allDays = Array.from({ length: 30 }, (_, i) => ({
      date: `2026-04-${String(i + 1).padStart(2, "0")}`,
      rawCode: "M",
      confidence: 0.85,
    }));

    const result = withEveryDayOfMonth(allDays, { year: 2026, month1To12: 4 });

    assert.equal(result.length, 30, "aprile ha 30 giorni");
    assert.ok(result.every((s) => s.rawCode === "M"));
  });
});
