// Colombian public holidays (festivos). Dates are handled as "YYYY-MM-DD"
// strings in UTC so they never shift with the viewer's time zone.

const DAY_MS = 24 * 60 * 60 * 1000;

// Fixed holidays that are never moved.
const FIXED_HOLIDAYS = ["01-01", "05-01", "07-20", "08-07", "12-08", "12-25"];

// Holidays moved to the following Monday by Ley 51 de 1983 (Ley Emiliani).
const MOVABLE_HOLIDAYS = [
	[1, 6],
	[3, 19],
	[6, 29],
	[8, 15],
	[10, 12],
	[11, 1],
	[11, 11],
] as const;

// Days after Easter Sunday: Holy Thursday and Good Friday stay put, the rest
// already land on the Monday the law moves them to.
const EASTER_OFFSETS = [-3, -2, 43, 64, 71];

const holidayCache = new Map<number, Set<string>>();

export function toDateKey(date: Date): string {
	return date.toISOString().slice(0, 10);
}

function utcDate(year: number, month: number, day: number) {
	return new Date(Date.UTC(year, month - 1, day));
}

function addDays(date: Date, days: number) {
	return new Date(date.getTime() + days * DAY_MS);
}

function nextMonday(date: Date) {
	return addDays(date, (8 - date.getUTCDay()) % 7);
}

// Anonymous Gregorian algorithm (Meeus/Jones/Butcher).
export function getEasterSunday(year: number): Date {
	const a = year % 19;
	const b = Math.floor(year / 100);
	const c = year % 100;
	const d = Math.floor(b / 4);
	const e = b % 4;
	const f = Math.floor((b + 8) / 25);
	const g = Math.floor((b - f + 1) / 3);
	const h = (19 * a + b - d - g + 15) % 30;
	const i = Math.floor(c / 4);
	const k = c % 4;
	const l = (32 + 2 * e + 2 * i - h - k) % 7;
	const m = Math.floor((a + 11 * h + 22 * l) / 451);
	const month = Math.floor((h + l - 7 * m + 114) / 31);
	const day = ((h + l - 7 * m + 114) % 31) + 1;

	return utcDate(year, month, day);
}

export function getColombianHolidays(year: number): Set<string> {
	const cached = holidayCache.get(year);

	if (cached) {
		return cached;
	}

	const easter = getEasterSunday(year);
	const holidays = new Set([
		...FIXED_HOLIDAYS.map((monthDay) => `${year}-${monthDay}`),
		...MOVABLE_HOLIDAYS.map(([month, day]) =>
			toDateKey(nextMonday(utcDate(year, month, day))),
		),
		...EASTER_OFFSETS.map((offset) => toDateKey(addDays(easter, offset))),
	]);

	holidayCache.set(year, holidays);
	return holidays;
}

export function isSundayOrHoliday(dateKey: string): boolean {
	const date = new Date(`${dateKey}T00:00:00Z`);

	return (
		date.getUTCDay() === 0 ||
		getColombianHolidays(date.getUTCFullYear()).has(dateKey)
	);
}
