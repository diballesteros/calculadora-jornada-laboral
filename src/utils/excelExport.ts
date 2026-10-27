import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { findColumns, type ImportedDay } from "./excelImport";
import {
	REGULAR_HOURS_LIMIT,
	calculateDayHours,
	parseTimeToMinutes,
} from "./hours";

// Writes the calculated hours back into the uploaded workbook. The xlsx is
// edited in place (only the cells that change) so the template's formatting,
// images and other sheets survive untouched.

export type CellCorrection = {
	row: number; // 1-based Excel row
	column: number; // 0-based column index
	date: string;
	label: string;
	previous: string;
	value: number;
};

const RESULT_COLUMNS = [
	["total", "Horas laboradas"],
	["overtime", "Extras"],
	["night", "Nocturnas"],
	["sunday", "Dominicales"],
] as const;

type ResultKey = (typeof RESULT_COLUMNS)[number][0];

const toHours = (minutes: number) => Math.round((minutes / 60) * 100) / 100;

// Hours per sheet row. The 8-hour limit applies to the whole date, so the
// regular hours are used up by the earliest shifts and overtime lands on the
// later ones; the rows of a date always add up to the day's totals.
export function calculateRowHours(
	days: ImportedDay[],
): Map<number, Record<ResultKey, number>> {
	const rows = new Map<number, Record<ResultKey, number>>();

	for (const day of days) {
		if (!day.results) {
			continue;
		}

		let regularLeft = REGULAR_HOURS_LIMIT;
		const shifts = day.shifts
			.map((shift) => ({
				row: shift.row,
				start: parseTimeToMinutes(shift.start)!,
				end: parseTimeToMinutes(shift.end)!,
			}))
			.sort((a, b) => a.start - b.start);

		for (const { row, start, end } of shifts) {
			const result = calculateDayHours([{ start, end }], day.isSunday);
			const regular = Math.min(result.totalMinutes, regularLeft);
			regularLeft -= regular;

			rows.set(row, {
				total: toHours(result.totalMinutes),
				overtime: toHours(result.totalMinutes - regular),
				night: toHours(result.nightMinutes),
				sunday: toHours(result.sundayMinutes),
			});
		}
	}

	return rows;
}

function readNumber(value: unknown): number | null {
	if (value === null || value === undefined || String(value).trim() === "") {
		return null;
	}

	const number = Number(String(value).trim().replace(",", "."));
	return Number.isFinite(number) ? number : NaN;
}

// Cells whose value differs from the calculation. Blank cells that should be
// 0 are left blank, as the template does for non-Sunday days.
export function findCorrections(
	data: unknown[][],
	days: ImportedDay[],
): CellCorrection[] {
	const columns = findColumns(data);

	if (!columns) {
		return [];
	}

	const corrections: CellCorrection[] = [];
	const dates = new Map(
		days.flatMap((day) => day.shifts.map((shift) => [shift.row, day.date])),
	);

	for (const [row, values] of calculateRowHours(days)) {
		for (const [key, label] of RESULT_COLUMNS) {
			const column = columns[key];

			if (column === -1) {
				continue;
			}

			const raw = data[row - 1]?.[column];
			const previous = readNumber(raw);
			const value = values[key];

			if (previous === null ? value !== 0 : Math.abs(previous - value) > 0.005) {
				corrections.push({
					row,
					column,
					date: dates.get(row)!,
					label,
					previous: String(raw ?? "").trim(),
					value,
				});
			}
		}
	}

	return corrections.sort((a, b) => a.row - b.row || a.column - b.column);
}

export function columnLetter(column: number): string {
	let letters = "";

	for (let n = column + 1; n > 0; n = Math.floor((n - 1) / 26)) {
		letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
	}

	return letters;
}

function columnIndex(letters: string) {
	return [...letters].reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

function getAttribute(attributes: string, name: string) {
	return attributes.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
}

function decodeXml(text: string) {
	return text
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&amp;/g, "&");
}

const ROW_PATTERN = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
const CELL_PATTERN = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;

// Writes numeric values into a worksheet's XML, keeping each cell's style.
// Missing cells are created with the style of the nearest cell above in the
// same column, so they match the table's borders and fonts. Returns the new
// XML and whether a formula was overwritten.
export function writeCells(
	sheetXml: string,
	cells: { row: number; column: number; value: number }[],
): { xml: string; removedFormula: boolean } {
	const byRow = new Map<number, Map<number, number>>();
	const columnStyles = new Map<number, string>();
	let removedFormula = false;

	for (const { row, column, value } of cells) {
		byRow.set(row, (byRow.get(row) ?? new Map()).set(column, value));
	}

	const writeRow = (rowNumber: number, attributes: string, content: string) => {
		const pending = byRow.get(rowNumber)!;
		byRow.delete(rowNumber);

		const existing: { column: number; xml: string }[] = [];

		for (const [xml, cellAttributes, cellContent = ""] of content.matchAll(CELL_PATTERN)) {
			const ref = getAttribute(cellAttributes, "r");

			if (!ref) {
				throw new Error(`Cell without reference in row ${rowNumber}`);
			}

			const column = columnIndex(ref.replace(/\d+$/, ""));
			const value = pending.get(column);

			if (value === undefined) {
				existing.push({ column, xml });
				continue;
			}

			pending.delete(column);
			removedFormula ||= cellContent.includes("<f");

			existing.push({
				column,
				xml: `<c${cellAttributes.replace(/\st="[^"]*"/, "")}><v>${value}</v></c>`,
			});
		}

		for (const [column, value] of pending) {
			const style = columnStyles.get(column);
			existing.push({
				column,
				xml: `<c r="${columnLetter(column)}${rowNumber}"${style ? ` s="${style}"` : ""}><v>${value}</v></c>`,
			});
		}

		existing.sort((a, b) => a.column - b.column);
		return `<row${attributes}>${existing.map((cell) => cell.xml).join("")}</row>`;
	};

	const sheetData = sheetXml.match(/<sheetData\b[^>]*?(?:\/>|>([\s\S]*?)<\/sheetData>)/);

	if (!sheetData) {
		throw new Error("Worksheet has no sheetData");
	}

	const rows: { row: number; xml: string }[] = [];

	for (const [xml, attributes, content = ""] of (sheetData[1] ?? "").matchAll(ROW_PATTERN)) {
		const row = Number(getAttribute(attributes, "r"));

		if (!row) {
			throw new Error("Row without reference");
		}

		// Rows to write that don't exist yet, before this one.
		for (const missing of [...byRow.keys()].filter((r) => r < row).sort((a, b) => a - b)) {
			rows.push({ row: missing, xml: writeRow(missing, ` r="${missing}"`, "") });
		}

		for (const [, cellAttributes] of content.matchAll(CELL_PATTERN)) {
			const ref = getAttribute(cellAttributes, "r");
			const style = getAttribute(cellAttributes, "s");

			if (ref && style) {
				columnStyles.set(columnIndex(ref.replace(/\d+$/, "")), style);
			}
		}

		rows.push({
			row,
			xml: byRow.has(row) ? writeRow(row, attributes, content) : xml,
		});
	}

	for (const row of [...byRow.keys()].sort((a, b) => a - b)) {
		rows.push({ row, xml: writeRow(row, ` r="${row}"`, "") });
	}

	rows.sort((a, b) => a.row - b.row);

	return {
		xml: sheetXml.replace(
			sheetData[0],
			`<sheetData>${rows.map((row) => row.xml).join("")}</sheetData>`,
		),
		removedFormula,
	};
}

function resolveSheetPath(files: Record<string, Uint8Array>, sheetName: string) {
	const workbook = strFromU8(files["xl/workbook.xml"]);
	const rels = strFromU8(files["xl/_rels/workbook.xml.rels"]);

	for (const [, attributes] of workbook.matchAll(/<sheet\b([^>]*?)\/?>/g)) {
		if (decodeXml(getAttribute(attributes, "name") ?? "") !== sheetName) {
			continue;
		}

		const id = attributes.match(/\br:id="([^"]*)"/)?.[1];

		for (const [, relationship] of rels.matchAll(/<Relationship\b([^>]*?)\/?>/g)) {
			if (getAttribute(relationship, "Id") === id) {
				const target = getAttribute(relationship, "Target")!;
				return target.startsWith("/") ? target.slice(1) : `xl/${target}`;
			}
		}
	}

	throw new Error(`Sheet "${sheetName}" not found`);
}

// Excel rebuilds the calculation chain on open; a stale one pointing at a
// removed formula makes it report the file as damaged.
function dropCalcChain(files: Record<string, Uint8Array>) {
	if (!files["xl/calcChain.xml"]) {
		return;
	}

	delete files["xl/calcChain.xml"];

	const rels = "xl/_rels/workbook.xml.rels";
	files[rels] = strToU8(
		strFromU8(files[rels]).replace(/<Relationship\b[^>]*calcChain[^>]*\/>/, ""),
	);

	const types = "[Content_Types].xml";
	files[types] = strToU8(
		strFromU8(files[types]).replace(/<Override\b[^>]*calcChain[^>]*\/>/, ""),
	);
}

export function applyCorrections(
	workbook: Uint8Array,
	sheetName: string,
	corrections: CellCorrection[],
): Uint8Array {
	const files = unzipSync(workbook);
	const sheetPath = resolveSheetPath(files, sheetName);

	const sheet = writeCells(strFromU8(files[sheetPath]), corrections);
	files[sheetPath] = strToU8(sheet.xml);

	if (sheet.removedFormula) {
		dropCalcChain(files);
	}

	return zipSync(files);
}
