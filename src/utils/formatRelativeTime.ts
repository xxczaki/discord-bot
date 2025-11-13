const SECOND_MS = 1000;
const MINUTE_MS = SECOND_MS * 60;
const HOUR_MS = MINUTE_MS * 60;
const DAY_MS = HOUR_MS * 24;

export default function formatRelativeTime(timestamp: number) {
	const difference = Date.now() - timestamp;

	if (difference < MINUTE_MS) {
		return 'just now';
	}

	if (difference < HOUR_MS) {
		const minutes = Math.floor(difference / MINUTE_MS);

		return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
	}

	if (difference < DAY_MS) {
		const hours = Math.floor(difference / HOUR_MS);

		return `${hours} hour${hours === 1 ? '' : 's'} ago`;
	}

	const days = Math.floor(difference / DAY_MS);

	return `${days} day${days === 1 ? '' : 's'} ago`;
}
