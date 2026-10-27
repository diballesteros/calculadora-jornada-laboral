export const REGULAR_HOURS_LIMIT = 8 * 60;
const NIGHT_RANGES = [
	{ start: 0, end: 6 * 60 },
	{ start: 18 * 60, end: 24 * 60 },
];

export type HoursBreakdown = {
	totalMinutes: number;
	regularMinutes: number;
	overtimeMinutes: number;
	nightMinutes: number;
	sundayMinutes: number;
};

export type ShiftRange = {
	start: number;
	end: number;
};

export function parseTimeToMinutes(value: string): number | null {
	if (!value) {
		return null;
	}

	const [hoursText, minutesText] = value.split(":");
	const hours = Number(hoursText);
	const minutes = Number(minutesText);

	// 24:00 is the end of the same day, so a shift can finish at midnight.
	if (hours === 24 && minutes === 0) {
		return 24 * 60;
	}

	if (
		!Number.isInteger(hours) ||
		!Number.isInteger(minutes) ||
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

// Adds up every shift worked on one day; the 8-hour limit applies to the
// day's total, not to each shift. Shifts must be valid and not overlap.
export function calculateDayHours(
	shifts: ShiftRange[],
	isSunday: boolean,
): HoursBreakdown {
	const totalMinutes = shifts.reduce(
		(sum, shift) => sum + shift.end - shift.start,
		0,
	);
	const nightMinutes = shifts.reduce((sum, shift) => {
		return (
			sum +
			NIGHT_RANGES.reduce((rangeSum, range) => {
				return (
					rangeSum +
					getRangeOverlap(shift.start, shift.end, range.start, range.end)
				);
			}, 0)
		);
	}, 0);

	return {
		totalMinutes,
		regularMinutes: Math.min(totalMinutes, REGULAR_HOURS_LIMIT),
		overtimeMinutes: Math.max(totalMinutes - REGULAR_HOURS_LIMIT, 0),
		nightMinutes,
		sundayMinutes: isSunday ? totalMinutes : 0,
	};
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

	return calculateDayHours([{ start: startMinutes, end: endMinutes }], isSunday);
}

export function formatDecimalHours(minutes: number): string {
	const hours = minutes / 60;

	return new Intl.NumberFormat("es-ES", {
		minimumFractionDigits: 0,
		maximumFractionDigits: 2,
	}).format(hours);
}
