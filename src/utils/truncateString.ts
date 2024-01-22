export default function truncateString(string: string, n: number) {
	if (string.length > n) {
		return string.slice(0, n) + '…';
	} else {
		return string;
	}
}
