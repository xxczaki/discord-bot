export interface ParsedCacheFilename {
	title: string;
	author: string;
	durationSeconds: number | null;
}

export default function parseOpusCacheFilename(
	filename: string,
): ParsedCacheFilename | null {
	if (!filename.endsWith('.opus')) {
		return null;
	}

	const nameWithoutExtension = filename.slice(0, -5);
	const parts = nameWithoutExtension.split('_');

	if (parts.length < 2) {
		return null;
	}

	const lastPart = parts.at(-1);
	const durationSeconds = lastPart ? Number.parseInt(lastPart, 10) : Number.NaN;
	const hasDuration = !Number.isNaN(durationSeconds);

	if (hasDuration) {
		const textParts = parts.slice(0, -1);
		const combinedText = textParts.join(' ');

		if (!combinedText) {
			return null;
		}

		return { title: combinedText, author: '', durationSeconds };
	}

	const combinedText = parts.join(' ');

	if (!combinedText) {
		return null;
	}

	return { title: combinedText, author: '', durationSeconds: null };
}
