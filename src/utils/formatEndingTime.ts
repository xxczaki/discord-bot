import { differenceInCalendarDays } from 'date-fns';

export default function formatEndingTime(estimatedEndTime: Date) {
	const now = new Date();
	const dayDifference = differenceInCalendarDays(estimatedEndTime, now);

	const formattedTime = estimatedEndTime.toLocaleTimeString('pl', {
		hour: '2-digit',
		minute: '2-digit',
	});

	if (dayDifference === 0) {
		return formattedTime;
	}

	if (dayDifference === 1) {
		return `${formattedTime} (tomorrow)`;
	}

	return `${formattedTime} (+${dayDifference} days)`;
}
