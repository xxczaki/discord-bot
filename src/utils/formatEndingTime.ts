export default function formatEndingTime(
	estimatedEndTime: Temporal.ZonedDateTime,
) {
	const dayDifference = Temporal.Now.plainDateISO(
		estimatedEndTime.timeZoneId,
	).until(estimatedEndTime.toPlainDate()).days;

	const formattedTime = estimatedEndTime.toLocaleString('pl', {
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
