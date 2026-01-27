import { transliterate } from 'transliteration';

const INVALID_FILENAME_CHARS = /[/\\:*?"<>|[\]]/g;
const MULTIPLE_UNDERSCORES_OR_SPACES = /[\s_]+/g;
const LEADING_TRAILING_UNDERSCORES = /^_+|_+$/g;

export default function sanitizeForFilename(
	input: string,
	maxLength: number,
): string {
	return transliterate(input)
		.toLowerCase()
		.replace(INVALID_FILENAME_CHARS, '_')
		.replace(MULTIPLE_UNDERSCORES_OR_SPACES, '_')
		.replace(LEADING_TRAILING_UNDERSCORES, '')
		.slice(0, maxLength);
}
