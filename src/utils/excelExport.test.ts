import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
	applyCorrections,
	calculateRowHours,
	columnLetter,
	findCorrections,
	writeCells,
} from "./excelExport";
import { groupShiftsByDate, parseShiftSheet } from "./excelImport";

// Same layout as the "FORMATO HORAS EXTRAS" template (see excelImport.test.ts).
const header = [
	["FORMATO HORAS EXTRAS", null, null, null, null, null, null, null, null],
	["NOMBRE DEL TRABAJADOR", null, null, null, null, null, null, null, null],
	["FECHA", "HORARIO PROGRAMADO", null, "HORAS LABORADAS", "EXTRAS A REPORTAR", "NOCTURNAS", "DOMINICALES", "CONCEPTO", "APROBADO"],
	[null, "HORA DE ENTRADA", "HORA DE SALIDA", null, null, null, null, null, null],
];

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

function daysFor(data: unknown[][], sundays: string[] = []) {
	return groupShiftsByDate(parseShiftSheet(data)!.shifts, (date) =>
		sundays.includes(date),
	);
}

describe("calculateRowHours", () => {
	it("puts a date's overtime on its later shifts so rows add up to the day", () => {
		// Rows 5 and 6 share a date: 00:00-05:00 then 09:00-13:00 = 9 hours.
		const rows = calculateRowHours(
			daysFor([
				...header,
				[day("2026-10-06"), "09:00am", "01:00pm", 4, 0, 0, null, "llegada", null],
				[day("2026-10-06"), "00:00am", "05:00am", 5, 0, 5, null, "retorno", null],
			]),
		);

		expect(rows.get(6)).toEqual({ total: 5, overtime: 0, night: 5, sunday: 0 });
		expect(rows.get(5)).toEqual({ total: 4, overtime: 1, night: 0, sunday: 0 });
	});
});

describe("findCorrections", () => {
	it("reports only cells that differ, leaving blank zero cells alone", () => {
		const data = [
			...header,
			// Correct already; blank Sunday cell should stay blank.
			[day("2026-10-01"), "05:30am", "03:30pm", 10, 2, 0.5, null, "", null],
			// Wrong night hours and missing Sunday hours.
			[day("2026-10-04"), "05:00pm", "00:00am", 7, 0, 5, null, "", null],
		];

		expect(findCorrections(data, daysFor(data, ["2026-10-04"]))).toEqual([
			{ row: 6, column: 5, date: "2026-10-04", label: "Nocturnas", previous: "5", value: 6 },
			{ row: 6, column: 6, date: "2026-10-04", label: "Dominicales", previous: "", value: 7 },
		]);
	});

	it("rounds to two decimals and accepts comma decimals in the sheet", () => {
		const data = [
			...header,
			[day("2026-10-01"), "05:40am", "08:00am", "2,33", 0, "0,33", null, "", null],
		];

		expect(findCorrections(data, daysFor(data))).toEqual([]);
	});
});

describe("columnLetter", () => {
	it("converts 0-based indexes to Excel letters", () => {
		expect(columnLetter(0)).toBe("A");
		expect(columnLetter(6)).toBe("G");
		expect(columnLetter(26)).toBe("AA");
	});
});

describe("writeCells", () => {
	const sheet = (rows: string) =>
		`<worksheet><dimension ref="A1:G4"/><sheetData>${rows}</sheetData><mergeCells count="0"/></worksheet>`;

	it("overwrites text and formula cells keeping their style", () => {
		const { xml, removedFormula } = writeCells(
			sheet(
				'<row r="1" spans="1:7"><c r="A1" s="2" t="s"><v>0</v></c><c r="E1" s="3" t="s"><v>4</v></c><c r="G1" s="3"/></row>' +
					'<row r="3"><c r="D3" s="5"><f>B3-C3</f><v>1</v></c></row>',
			),
			[
				{ row: 1, column: 4, value: 2 },
				{ row: 1, column: 6, value: 0.5 },
				{ row: 3, column: 3, value: 9 },
			],
		);

		expect(xml).toBe(
			sheet(
				'<row r="1" spans="1:7"><c r="A1" s="2" t="s"><v>0</v></c><c r="E1" s="3"><v>2</v></c><c r="G1" s="3"><v>0.5</v></c></row>' +
					'<row r="3"><c r="D3" s="5"><v>9</v></c></row>',
			),
		);
		expect(removedFormula).toBe(true);
	});

	it("creates missing cells and rows in order, styled like the cell above", () => {
		const { xml } = writeCells(
			sheet(
				'<row r="1"><c r="A1" s="2"/><c r="E1" s="3"/></row>' +
					'<row r="4"><c r="A4" s="2"/></row>',
			),
			[
				{ row: 1, column: 5, value: 1 },
				{ row: 2, column: 4, value: 8 },
				{ row: 4, column: 4, value: 3 },
				{ row: 5, column: 0, value: 7 },
			],
		);

		expect(xml).toBe(
			sheet(
				'<row r="1"><c r="A1" s="2"/><c r="E1" s="3"/><c r="F1"><v>1</v></c></row>' +
					'<row r="2"><c r="E2" s="3"><v>8</v></c></row>' +
					'<row r="4"><c r="A4" s="2"/><c r="E4" s="3"><v>3</v></c></row>' +
					'<row r="5"><c r="A5" s="2"><v>7</v></c></row>',
			),
		);
	});
});

describe("applyCorrections", () => {
	it("edits only the chosen sheet of the workbook and keeps other parts", () => {
		const workbook = zipSync({
			"[Content_Types].xml": strToU8("<Types/>"),
			"xl/workbook.xml": strToU8(
				'<workbook><sheets><sheet name="A &amp; B" sheetId="1" r:id="rId1"/><sheet name="OTRA" sheetId="2" r:id="rId2"/></sheets></workbook>',
			),
			"xl/_rels/workbook.xml.rels": strToU8(
				'<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml"/></Relationships>',
			),
			"xl/styles.xml": strToU8("<styleSheet/>"),
			"xl/worksheets/sheet1.xml": strToU8('<worksheet><sheetData><row r="1"/></sheetData></worksheet>'),
			"xl/worksheets/sheet2.xml": strToU8('<worksheet><sheetData><row r="1"/></sheetData></worksheet>'),
			"xl/media/image1.jpeg": new Uint8Array([1, 2, 3]),
		});

		const files = unzipSync(
			applyCorrections(workbook, "OTRA", [
				{ row: 1, column: 1, date: "2026-10-01", label: "Extras", previous: "", value: 3 },
			]),
		);

		expect(strFromU8(files["xl/worksheets/sheet2.xml"])).toBe(
			'<worksheet><sheetData><row r="1"><c r="B1"><v>3</v></c></row></sheetData></worksheet>',
		);
		expect(strFromU8(files["xl/worksheets/sheet1.xml"])).toBe(
			'<worksheet><sheetData><row r="1"/></sheetData></worksheet>',
		);
		expect(strFromU8(files["xl/styles.xml"])).toBe("<styleSheet/>");
		expect(files["xl/media/image1.jpeg"]).toEqual(new Uint8Array([1, 2, 3]));
	});
});
