import { describe, expect, it } from "vitest";
import {
	getColombianHolidays,
	getEasterSunday,
	isSundayOrHoliday,
	toDateKey,
} from "./holidays";

describe("getEasterSunday", () => {
	it("matches known Easter dates", () => {
		expect(toDateKey(getEasterSunday(2024))).toBe("2024-03-31");
		expect(toDateKey(getEasterSunday(2025))).toBe("2025-04-20");
		expect(toDateKey(getEasterSunday(2026))).toBe("2026-04-05");
	});
});

describe("getColombianHolidays", () => {
	it("lists the 18 Colombian holidays for 2026", () => {
		expect([...getColombianHolidays(2026)].sort()).toEqual([
			"2026-01-01",
			"2026-01-12",
			"2026-03-23",
			"2026-04-02",
			"2026-04-03",
			"2026-05-01",
			"2026-05-18",
			"2026-06-08",
			"2026-06-15",
			"2026-06-29",
			"2026-07-20",
			"2026-08-07",
			"2026-08-17",
			"2026-10-12",
			"2026-11-02",
			"2026-11-16",
			"2026-12-08",
			"2026-12-25",
		]);
	});
});

describe("isSundayOrHoliday", () => {
	it("flags Sundays and holidays but not ordinary days", () => {
		expect(isSundayOrHoliday("2026-10-04")).toBe(true);
		expect(isSundayOrHoliday("2026-10-12")).toBe(true);
		expect(isSundayOrHoliday("2026-10-13")).toBe(false);
		expect(isSundayOrHoliday("2026-10-10")).toBe(false);
	});
});
