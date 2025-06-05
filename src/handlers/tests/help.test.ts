import type { ChatInputCommandInteraction } from 'discord.js';
import { beforeEach, expect, it, vi } from 'vitest';
import helpCommandHandler from '../help';

function createMockInteraction(): ChatInputCommandInteraction {
	return {
		reply: vi.fn().mockResolvedValue({}),
	} as unknown as ChatInputCommandInteraction;
}

function getContentFromReply(
	mockInteraction: ChatInputCommandInteraction,
): string {
	const [[callArgs]] = vi.mocked(mockInteraction.reply).mock.calls;
	return typeof callArgs === 'string'
		? callArgs
		: (callArgs as { content: string }).content;
}

beforeEach(() => {
	vi.clearAllMocks();
});

it('should reply with help message content and ephemeral flag', async () => {
	const mockInteraction = createMockInteraction();

	await helpCommandHandler(mockInteraction);

	expect(mockInteraction.reply).toHaveBeenCalledOnce();
	expect(mockInteraction.reply).toHaveBeenCalledWith({
		content: expect.stringContaining('### Music'),
		flags: ['Ephemeral'],
	});
});

it('should include all command categories in response', async () => {
	const mockInteraction = createMockInteraction();

	await helpCommandHandler(mockInteraction);

	const content = getContentFromReply(mockInteraction);

	expect(content).toContain('### Music');
	expect(content).toContain('### Utilities');
	expect(content).toContain('### Fun');
	expect(content).toContain('### Other');
});

it('should format commands correctly with proper notation and structure', async () => {
	const mockInteraction = createMockInteraction();

	await helpCommandHandler(mockInteraction);

	const content = getContentFromReply(mockInteraction);

	// Command notation with required parameters
	expect(content).toContain('`/play <query>`');
	expect(content).toContain('`/move <query> <to>`');

	// Command notation with optional parameters
	expect(content).toContain('`/lateness <?expected_hour>`');

	// Commands without parameters
	expect(content).toContain('`/pause`');
	expect(content).toContain('`/resume`');
	expect(content).toContain('`/skip`');

	// Commands with choices
	expect(content).toContain('`/repeat <repeat_mode>`');
	expect(content).toContain('`/deduplicate <algorithm>`');

	// Tree formatting characters
	expect(content).toContain('┌');
	expect(content).toContain('├');
});

it('should include comprehensive command content and descriptions', async () => {
	const mockInteraction = createMockInteraction();

	await helpCommandHandler(mockInteraction);

	const content = getContentFromReply(mockInteraction);

	expect(content).toContain(
		'Search for music on Spotify or YouTube and play it',
	);
	expect(content).toContain('Pause the queue');
	expect(content).toContain('Resume the queue');

	expect(content).toContain('`/play <query>`');
	expect(content).toContain('`/help`');
	expect(content).toContain('`/avatar <user>`');
	expect(content).toContain('`/tic_tac_toe`');
	expect(content).toContain('`/opus_cache`');

	expect(content).not.toContain('category:');
	expect(content).not.toContain('"category"');
});

it('should sort commands alphabetically within categories', async () => {
	const mockInteraction = createMockInteraction();

	await helpCommandHandler(mockInteraction);

	const content = getContentFromReply(mockInteraction);

	const musicSectionMatch = content.match(
		/### Music\n([\s\S]*?)(?=\n### |\n$)/,
	);

	expect(musicSectionMatch).toBeTruthy();

	if (musicSectionMatch) {
		const musicSection = musicSectionMatch[1];
		const commandLines = musicSection
			.split('\n')
			.filter((line: string) => line.includes('`/'));

		const commandNames = commandLines
			.map((line: string) => {
				const match = line.match(/`\/(\w+)/);
				return match ? match[1] : '';
			})
			.filter(Boolean);

		const sortedNames = [...commandNames].sort();

		expect(commandNames).toEqual(sortedNames);
	}
});
