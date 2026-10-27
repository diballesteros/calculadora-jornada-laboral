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

// Light yellow, the same as Excel's "Neutral" cell style.
const HIGHLIGHT_FILL =
	'<fill><patternFill patternType="solid"><fgColor rgb="FFFFEB9C"/><bgColor indexed="64"/></patternFill></fill>';

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

function setAttribute(attributes: string, name: string, value: string) {
	const pattern = new RegExp(`\\s${name}="[^"]*"`);
	const attribute = ` ${name}="${value}"`;

	return pattern.test(attributes)
		? attributes.replace(pattern, attribute)
		: attributes + attribute;
}

function decodeXml(text: string) {
	return text
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&amp;/g, "&");
}

// Adds a highlight fill plus a highlighted copy of each cell style used by the
// corrected cells. Returns the new styles.xml and the old → new style index.
export function addHighlightStyles(
	stylesXml: string,
	styleIndexes: number[],
): { xml: string; styleMap: Map<number, number> } {
	const fills = stylesXml.match(/<fills\b([^>]*)>([\s\S]*?)<\/fills>/);
	const cellXfs = stylesXml.match(/<cellXfs\b([^>]*)>([\s\S]*?)<\/cellXfs>/);

	if (!fills || !cellXfs) {
		throw new Error("styles.xml has no fills or cellXfs");
	}

	const fillCount = fills[2].match(/<fill\b/g)?.length ?? 0;
	const xfs = cellXfs[2].match(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g) ?? [];
	const styleMap = new Map<number, number>();
	const added: string[] = [];

	for (const index of new Set(styleIndexes)) {
		const xf = xfs[index] ?? '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>';
		const tagEnd = xf.search(/\/?>/);
		const attributes = setAttribute(
			setAttribute(xf.slice(3, tagEnd), "fillId", String(fillCount)),
			"applyFill",
			"1",
		);

		styleMap.set(index, xfs.length + added.length);
		added.push(`<xf${attributes}${xf.slice(tagEnd)}`);
	}

	const xml = stylesXml
		.replace(
			fills[0],
			`<fills${setAttribute(fills[1], "count", String(fillCount + 1))}>${fills[2]}${HIGHLIGHT_FILL}</fills>`,
		)
		.replace(
			cellXfs[0],
			`<cellXfs${setAttribute(cellXfs[1], "count", String(xfs.length + added.length))}>${cellXfs[2]}${added.join("")}</cellXfs>`,
		);

	return { xml, styleMap };
}

const ROW_PATTERN = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
const CELL_PATTERN = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;

// Writes numeric values into a worksheet's XML, creating cells and rows when
// needed. `style` returns the style index to give each cell, from its current
// one. Returns the new XML and whether a formula was overwritten.
export function writeCells(
	sheetXml: string,
	cells: { row: number; column: number; value: number }[],
	style: (current: number) => number,
): { xml: string; removedFormula: boolean } {
	const byRow = new Map<number, Map<number, number>>();
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

			const current = Number(getAttribute(cellAttributes, "s") ?? 0);
			const kept = cellAttributes.replace(/\s(?:t|s)="[^"]*"/g, "");
			existing.push({
				column,
				xml: `<c${setAttribute(kept, "s", String(style(current)))}><v>${value}</v></c>`,
			});
		}

		for (const [column, value] of pending) {
			existing.push({
				column,
				xml: `<c r="${columnLetter(column)}${rowNumber}" s="${style(0)}"><v>${value}</v></c>`,
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

		rows.push({
			row,
			xml: byRow.has(row) ? writeRow(row, attributes, content) : xml,
		});
	}

	for (const row of [...byRow.keys()]) {
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
	const sheetXml = strFromU8(files[sheetPath]);

	const styleIndexes = [0];
	for (const [, attributes] of sheetXml.matchAll(CELL_PATTERN)) {
		const ref = getAttribute(attributes, "r");
		const match = ref?.match(/^([A-Z]+)(\d+)$/);

		if (
			match &&
			corrections.some(
				(cell) =>
					cell.row === Number(match[2]) &&
					cell.column === columnIndex(match[1]),
			)
		) {
			styleIndexes.push(Number(getAttribute(attributes, "s") ?? 0));
		}
	}

	const styles = addHighlightStyles(
		strFromU8(files["xl/styles.xml"]),
		styleIndexes,
	);
	const sheet = writeCells(
		sheetXml,
		corrections,
		(current) => styles.styleMap.get(current)!,
	);

	files["xl/styles.xml"] = strToU8(styles.xml);
	files[sheetPath] = strToU8(sheet.xml);

	if (sheet.removedFormula) {
		dropCalcChain(files);
	}

	return zipSync(files);
}
