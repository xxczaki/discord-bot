import sanitizeForFilename from './sanitizeForFilename';

const MAX_TITLE_LENGTH = 100;
const MAX_AUTHOR_LENGTH = 50;

interface TrackMetadata {
	title: string;
	author: string;
	durationMS: number;
}

export default function generateOpusCacheFilename(
	metadata: TrackMetadata,
): string {
	const title = sanitizeForFilename(
		metadata.title || 'unknown_title',
		MAX_TITLE_LENGTH,
	);
	const author = sanitizeForFilename(
		metadata.author || 'unknown_artist',
		MAX_AUTHOR_LENGTH,
	);
	const durationSeconds = Math.round(metadata.durationMS / 1000);

	if (durationSeconds === 0) {
		return `${title}_${author}.opus`;
	}

	return `${title}_${author}_${durationSeconds}.opus`;
}
