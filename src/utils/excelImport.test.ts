import { describe, expect, it } from "vitest";
import {
	groupShiftsByDate,
	parseSheetDate,
	parseSheetTime,
	parseShiftSheet,
} from "./excelImport";

const hours = (value: number) => value * 60;

// Same layout as the "FORMATO HORAS EXTRAS" template: a title, a name row and
// a two-row header before the shifts.
const header = [
	["FORMATO HORAS EXTRAS", null, null, null, null, null, null, null, null],
	["NOMBRE DEL TRABAJADOR", null, null, null, null, null, null, null, null],
	["FECHA", "HORARIO PROGRAMADO", null, "HORAS LABORADAS", "EXTRAS A REPORTAR", "NOCTURNAS", "DOMINICALES", "CONCEPTO", "APROBADO"],
	[null, "HORA DE ENTRADA", "HORA DE SALIDA", null, null, null, null, null, null],
];

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("parseSheetTime", () => {
	it("reads 12-hour times with am/pm in several spellings", () => {
		expect(parseSheetTime("05:30am", "start")).toBe("05:30");
		expect(parseSheetTime("03:30pm", "end")).toBe("15:30");
		expect(parseSheetTime("12:00pm", "end")).toBe("12:00");
		expect(parseSheetTime("7:15 p. m.", "end")).toBe("19:15");
		expect(parseSheetTime("17:00", "end")).toBe("17:00");
	});

	it("treats midnight as the start of the day or the end of the day by role", () => {
		expect(parseSheetTime("00:00am", "start")).toBe("00:00");
		expect(parseSheetTime("00:00am", "end")).toBe("24:00");
		expect(parseSheetTime("00.00am", "end")).toBe("24:00");
		expect(parseSheetTime("12:00am", "end")).toBe("24:00");
	});

	it("reads Excel time cells", () => {
		expect(parseSheetTime(0.25, "start")).toBe("06:00");
		expect(parseSheetTime(new Date(Date.UTC(1899, 11, 30, 18, 30)), "end")).toBe("18:30");
	});

	it("rejects unreadable times", () => {
		for (const value of ["/", "abc", "13:00pm", "25:00", "10:75", null]) {
			expect(parseSheetTime(value, "start")).toBeNull();
		}
		expect(parseSheetTime("24:00", "start")).toBeNull();
	});
});

describe("parseSheetDate", () => {
	it("reads dates, Excel serials and text dates", () => {
		expect(parseSheetDate(day("2026-10-04"))).toBe("2026-10-04");
		expect(parseSheetDate(46299)).toBe("2026-10-04");
		expect(parseSheetDate("4/10/2026")).toBe("2026-10-04");
		expect(parseSheetDate("hola")).toBeNull();
	});
});

describe("parseShiftSheet", () => {
	it("returns null when the expected columns are missing", () => {
		expect(parseShiftSheet([["A", "B"], [1, 2]])).toBeNull();
	});

	it("reads shifts, skips days off and reports bad rows with their Excel row", () => {
		const result = parseShiftSheet([
			...header,
			[day("2026-10-04"), "/", "/", 0, 0, 0, 0, null, null],
			[day("2026-10-05"), "01:00pm", "00.00am", 11, 3, 6, null, " salida ", null],
			[day("2026-10-06"), "09:00am", "soon", null, null, null, null, null, null],
			[day("2026-10-07"), "05:00pm", "03:00pm", null, null, null, null, null, null],
		]);

		expect(result?.shifts).toEqual([
			{ row: 6, date: "2026-10-05", start: "13:00", end: "24:00", concept: "salida" },
		]);
		expect(result?.issues.map((issue) => issue.row)).toEqual([7, 8]);
	});
});

describe("groupShiftsByDate", () => {
	const shift = (date: string, start: string, end: string, row = 1) => ({
		row,
		date,
		start,
		end,
		concept: "",
	});

	it("adds shifts on the same date before applying the 8-hour limit", () => {
		const [result] = groupShiftsByDate(
			[shift("2026-10-15", "00:00", "05:00"), shift("2026-10-15", "09:00", "13:00", 2)],
			() => false,
		);
		expect(result.results?.totalMinutes).toBe(hours(9));
		expect(result.results?.overtimeMinutes).toBe(hours(1));
	});

	it("uses the Sunday/holiday check for each date and sorts by date", () => {
		const result = groupShiftsByDate(
			[shift("2026-10-05", "08:00", "12:00"), shift("2026-10-04", "14:00", "24:00")],
			(date) => date === "2026-10-04",
		);
		expect(result.map((entry) => entry.date)).toEqual(["2026-10-04", "2026-10-05"]);
		expect(result[0].results?.sundayMinutes).toBe(hours(10));
		expect(result[1].results?.sundayMinutes).toBe(0);
	});

	it("flags overlapping shifts on the same date", () => {
		const [result] = groupShiftsByDate(
			[shift("2026-10-15", "08:00", "12:00"), shift("2026-10-15", "11:00", "14:00", 2)],
			() => false,
		);
		expect(result.results).toBeNull();
		expect(result.error).not.toBeNull();
	});
});
