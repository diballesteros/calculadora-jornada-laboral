import { describe, expect, it } from "vitest";
import {
	calculateDayHours,
	calculateHours,
	formatDecimalHours,
	parseTimeToMinutes,
} from "./hours";

const hours = (value: number) => value * 60;

describe("parseTimeToMinutes", () => {
	it("parses valid HH:MM values", () => {
		expect(parseTimeToMinutes("00:00")).toBe(0);
		expect(parseTimeToMinutes("08:30")).toBe(hours(8.5));
		expect(parseTimeToMinutes("23:59")).toBe(hours(24) - 1);
	});

	it("accepts 24:00 as the end of the day", () => {
		expect(parseTimeToMinutes("24:00")).toBe(hours(24));
	});

	it("rejects empty, malformed and out-of-range values", () => {
		for (const value of ["", "8", "ab:00", "1.5:00", "24:30", "25:00", "10:60", "-1:00"]) {
			expect(parseTimeToMinutes(value)).toBeNull();
		}
	});
});

describe("calculateHours", () => {
	it("rejects shifts that end at or before they start (no crossing midnight)", () => {
		expect(calculateHours("10:00", "10:00", false)).toBeNull();
		expect(calculateHours("22:00", "06:00", false)).toBeNull();
		expect(calculateHours("", "10:00", false)).toBeNull();
	});

	it("counts up to 8 hours as regular with no overtime", () => {
		expect(calculateHours("08:00", "16:00", false)).toEqual({
			totalMinutes: hours(8),
			regularMinutes: hours(8),
			overtimeMinutes: 0,
			nightMinutes: 0,
			sundayMinutes: 0,
		});
	});

	it("counts everything beyond 8 hours as overtime", () => {
		const result = calculateHours("07:00", "17:30", false);
		expect(result?.regularMinutes).toBe(hours(8));
		expect(result?.overtimeMinutes).toBe(hours(2.5));
	});

	it("counts night hours between 18:00 and 06:00 on both ends of the day", () => {
		expect(calculateHours("04:00", "10:00", false)?.nightMinutes).toBe(hours(2));
		expect(calculateHours("17:00", "21:30", false)?.nightMinutes).toBe(hours(3.5));
		expect(calculateHours("00:00", "24:00", false)?.nightMinutes).toBe(hours(12));
		expect(calculateHours("06:00", "18:00", false)?.nightMinutes).toBe(0);
	});

	it("allows a shift to end at midnight", () => {
		const result = calculateHours("16:00", "24:00", false);
		expect(result?.totalMinutes).toBe(hours(8));
		expect(result?.nightMinutes).toBe(hours(6));
	});

	it("counts the whole shift as Sunday hours only when flagged", () => {
		expect(calculateHours("09:00", "13:00", true)?.sundayMinutes).toBe(hours(4));
		expect(calculateHours("09:00", "13:00", false)?.sundayMinutes).toBe(0);
	});

	it("lets categories overlap", () => {
		const result = calculateHours("12:00", "23:00", true);
		expect(result).toEqual({
			totalMinutes: hours(11),
			regularMinutes: hours(8),
			overtimeMinutes: hours(3),
			nightMinutes: hours(5),
			sundayMinutes: hours(11),
		});
	});

	it("keeps regular plus overtime equal to the total", () => {
		for (const [start, end] of [["00:00", "24:00"], ["08:00", "12:00"], ["05:30", "20:00"]]) {
			const result = calculateHours(start, end, false);
			expect(result!.regularMinutes + result!.overtimeMinutes).toBe(result!.totalMinutes);
		}
	});
});

describe("calculateDayHours", () => {
	it("applies the 8-hour limit to the total of all shifts in a day", () => {
		const result = calculateDayHours(
			[
				{ start: 0, end: hours(5) },
				{ start: hours(9), end: hours(13) },
			],
			false,
		);
		expect(result.totalMinutes).toBe(hours(9));
		expect(result.regularMinutes).toBe(hours(8));
		expect(result.overtimeMinutes).toBe(hours(1));
		expect(result.nightMinutes).toBe(hours(5));
	});
});

describe("formatDecimalHours", () => {
	it("formats minutes as decimal hours with es-ES separators", () => {
		expect(formatDecimalHours(hours(8))).toBe("8");
		expect(formatDecimalHours(hours(2.5))).toBe("2,5");
		expect(formatDecimalHours(20)).toBe("0,33");
	});
});
