import { toDateKey } from "./holidays";
import {
	calculateDayHours,
	parseTimeToMinutes,
	type HoursBreakdown,
} from "./hours";

// Turns the rows of an "HORAS EXTRAS" sheet into shifts grouped by date.
// Kept free of any spreadsheet library so it can be tested with plain arrays.

export type ImportedShift = {
	row: number;
	date: string;
	start: string;
	end: string;
	concept: string;
};

export type ImportIssue = {
	row: number;
	message: string;
};

export type ImportedDay = {
	date: string;
	shifts: ImportedShift[];
	isSunday: boolean;
	results: HoursBreakdown | null;
	error: string | null;
};

type Columns = {
	headerRow: number;
	date: number;
	start: number;
	end: number;
	concept: number;
};

const DAY_OFF_MARKERS = ["", "/", "-"];
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

function normalizeText(value: unknown) {
	return String(value ?? "")
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.trim()
		.toUpperCase();
}

function formatTime(minutes: number) {
	const hours = Math.floor(minutes / 60);
	return `${String(hours).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function isDayOff(value: unknown) {
	return (
		value === null ||
		value === undefined ||
		DAY_OFF_MARKERS.includes(String(value).trim())
	);
}

// Reads times written as "05:30am", "03:30 p. m.", "00.00am", "17:00", or as
// Excel time cells. Midnight as an end time means the end of the same day.
export function parseSheetTime(
	value: unknown,
	role: "start" | "end",
): string | null {
	let minutes: number | null = null;

	if (value instanceof Date) {
		minutes = value.getUTCHours() * 60 + value.getUTCMinutes();
	} else if (typeof value === "number" && value >= 0 && value < 1) {
		minutes = Math.round(value * 24 * 60);
	} else if (typeof value === "string") {
		const match = value
			.trim()
			.toLowerCase()
			.match(/^(\d{1,2})[:.](\d{2})\s*(?:([ap])\.?\s*m\.?)?$/);

		if (match) {
			let hours = Number(match[1]);
			const meridiem = match[3];

			// "00:00am" is a common way of writing midnight, so 0 is allowed.
			if (meridiem) {
				hours =
					hours > 12 ? NaN : (hours % 12) + (meridiem === "p" ? 12 : 0);
			}

			minutes = parseTimeToMinutes(`${hours}:${match[2]}`);
		}
	}

	if (minutes === null || minutes < 0 || minutes > 24 * 60) {
		return null;
	}

	if (minutes === 0 && role === "end") {
		return "24:00";
	}

	return minutes === 24 * 60 && role === "start" ? null : formatTime(minutes);
}

export function parseSheetDate(value: unknown): string | null {
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		return toDateKey(value);
	}

	if (typeof value === "number" && value >= 1) {
		return toDateKey(new Date(EXCEL_EPOCH_MS + Math.floor(value) * 86400000));
	}

	if (typeof value === "string") {
		const iso = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
		const local = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

		if (iso) {
			return `${iso[1]}-${iso[2]}-${iso[3]}`;
		}

		if (local) {
			return `${local[3]}-${local[2].padStart(2, "0")}-${local[1].padStart(2, "0")}`;
		}
	}

	return null;
}

function findColumns(data: unknown[][]): Columns | null {
	const columns = { headerRow: -1, date: -1, start: -1, end: -1, concept: -1 };

	// Headers can span two rows ("HORARIO PROGRAMADO" above ENTRADA/SALIDA).
	for (let rowIndex = 0; rowIndex < Math.min(data.length, 20); rowIndex++) {
		data[rowIndex].forEach((cell, columnIndex) => {
			const text = normalizeText(cell);
			const found = (key: keyof Omit<Columns, "headerRow">) => {
				if (columns[key] === -1) {
					columns[key] = columnIndex;
					columns.headerRow = rowIndex;
				}
			};

			if (text === "FECHA") found("date");
			else if (text.includes("ENTRADA")) found("start");
			else if (text.includes("SALIDA")) found("end");
			else if (text === "CONCEPTO") found("concept");
		});
	}

	return columns.date === -1 || columns.start === -1 || columns.end === -1
		? null
		: columns;
}

export function parseShiftSheet(data: unknown[][]): {
	shifts: ImportedShift[];
	issues: ImportIssue[];
} | null {
	const columns = findColumns(data);

	if (!columns) {
		return null;
	}

	const shifts: ImportedShift[] = [];
	const issues: ImportIssue[] = [];

	data.slice(columns.headerRow + 1).forEach((cells, index) => {
		const row = columns.headerRow + index + 2;
		const rawStart = cells[columns.start];
		const rawEnd = cells[columns.end];

		if (isDayOff(rawStart) && isDayOff(rawEnd)) {
			return;
		}

		const date = parseSheetDate(cells[columns.date]);
		const start = parseSheetTime(rawStart, "start");
		const end = parseSheetTime(rawEnd, "end");

		if (!date) {
			issues.push({ row, message: "Fecha no reconocida." });
		} else if (!start || !end) {
			issues.push({
				row,
				message: `Hora no reconocida: "${String(rawStart ?? "")}" - "${String(rawEnd ?? "")}".`,
			});
		} else if (parseTimeToMinutes(end)! <= parseTimeToMinutes(start)!) {
			issues.push({
				row,
				message: `La salida (${end}) debe ser posterior a la entrada (${start}).`,
			});
		} else {
			shifts.push({
				row,
				date,
				start,
				end,
				concept:
					columns.concept === -1
						? ""
						: String(cells[columns.concept] ?? "").trim(),
			});
		}
	});

	return { shifts, issues };
}

export function groupShiftsByDate(
	shifts: ImportedShift[],
	isSundayForDate: (date: string) => boolean,
): ImportedDay[] {
	const byDate = new Map<string, ImportedShift[]>();

	for (const shift of shifts) {
		byDate.set(shift.date, [...(byDate.get(shift.date) ?? []), shift]);
	}

	return [...byDate.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([date, dayShifts]) => {
			const ranges = dayShifts
				.map((shift) => ({
					start: parseTimeToMinutes(shift.start)!,
					end: parseTimeToMinutes(shift.end)!,
				}))
				.sort((a, b) => a.start - b.start);
			const overlaps = ranges.some(
				(range, index) => index > 0 && range.start < ranges[index - 1].end,
			);
			const isSunday = isSundayForDate(date);

			return {
				date,
				shifts: dayShifts,
				isSunday,
				results: overlaps ? null : calculateDayHours(ranges, isSunday),
				error: overlaps ? "Los turnos de este dia se superponen." : null,
			};
		});
}
