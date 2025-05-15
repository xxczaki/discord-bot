import { expect, it } from 'vitest';
import getCommitLink from '../getCommitLink';

const EXAMPLE_COMMIT_HASH = 'abc123def456';
const EXPECTED_MARKDOWN_LINK =
	'[`abc123def456`](<https://github.com/xxczaki/discord-bot/commit/abc123def456>)';

it('should create a markdown link with the commit hash', () => {
	expect(getCommitLink(EXAMPLE_COMMIT_HASH)).toBe(EXPECTED_MARKDOWN_LINK);
});

it('should handle short commit hashes', () => {
	const shortHash = 'abc123';
	expect(getCommitLink(shortHash)).toBe(
		'[`abc123`](<https://github.com/xxczaki/discord-bot/commit/abc123>)',
	);
});

it('should handle empty string', () => {
	expect(getCommitLink('')).toBe(
		'[``](<https://github.com/xxczaki/discord-bot/commit/>)',
	);
});
