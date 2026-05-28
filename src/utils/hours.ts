const REGULAR_HOURS_LIMIT = 8 * 60;
const NIGHT_RANGES = [
	{ start: 0, end: 6 * 60 },
	{ start: 19 * 60, end: 24 * 60 },
];

export type HoursBreakdown = {
	totalMinutes: number;
	regularMinutes: number;
	overtimeMinutes: number;
	nightMinutes: number;
	sundayMinutes: number;
};

export function parseTimeToMinutes(value: string): number | null {
	if (!value) {
		return null;
	}

	const [hoursText, minutesText] = value.split(":");
	const hours = Number(hoursText);
	const minutes = Number(minutesText);

	if (
		Number.isNaN(hours) ||
		Number.isNaN(minutes) ||
		hours < 0 ||
		hours > 23 ||
		minutes < 0 ||
		minutes > 59
	) {
		return null;
	}

	return hours * 60 + minutes;
}

function getRangeOverlap(
	start: number,
	end: number,
	rangeStart: number,
	rangeEnd: number,
) {
	return Math.max(0, Math.min(end, rangeEnd) - Math.max(start, rangeStart));
}

export function calculateHours(
	startTime: string,
	endTime: string,
	isSunday: boolean,
): HoursBreakdown | null {
	const startMinutes = parseTimeToMinutes(startTime);
	const endMinutes = parseTimeToMinutes(endTime);

	if (
		startMinutes === null ||
		endMinutes === null ||
		endMinutes <= startMinutes
	) {
		return null;
	}

	const totalMinutes = endMinutes - startMinutes;
	const regularMinutes = Math.min(totalMinutes, REGULAR_HOURS_LIMIT);
	const overtimeMinutes = Math.max(totalMinutes - REGULAR_HOURS_LIMIT, 0);
	const nightMinutes = NIGHT_RANGES.reduce((sum, range) => {
		return (
			sum +
			getRangeOverlap(startMinutes, endMinutes, range.start, range.end)
		);
	}, 0);

	return {
		totalMinutes,
		regularMinutes,
		overtimeMinutes,
		nightMinutes,
		sundayMinutes: isSunday ? totalMinutes : 0,
	};
}

export function formatDecimalHours(minutes: number): string {
	const hours = minutes / 60;

	return new Intl.NumberFormat("es-ES", {
		minimumFractionDigits: 0,
		maximumFractionDigits: 2,
	}).format(hours);
}
