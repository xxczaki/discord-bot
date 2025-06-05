import { useQueue } from 'discord-player';
import type { ChatInputCommandInteraction } from 'discord.js';
import { beforeEach, expect, it, vi } from 'vitest';
import skipCommandHandler from '../skip';

vi.mock('discord-player', () => ({
	useQueue: vi.fn(),
}));

const mockedUseQueue = vi.mocked(useQueue);

beforeEach(() => {
	vi.clearAllMocks();
});

function createMockInteraction(): ChatInputCommandInteraction {
	return {
		reply: vi.fn().mockResolvedValue({}),
	} as unknown as ChatInputCommandInteraction;
}

function createMockQueue(): NonNullable<ReturnType<typeof useQueue>> {
	return {
		node: {
			skip: vi.fn(),
		},
	} as unknown as NonNullable<ReturnType<typeof useQueue>>;
}

it('should skip the track and reply with success message', async () => {
	const interaction = createMockInteraction();
	const mockQueue = createMockQueue();
	mockedUseQueue.mockReturnValue(mockQueue);

	await skipCommandHandler(interaction);

	expect(mockQueue.node.skip).toHaveBeenCalledWith();
	expect(interaction.reply).toHaveBeenCalledWith('Track skipped.');
});

it('should handle when queue is null', async () => {
	const interaction = createMockInteraction();
	mockedUseQueue.mockReturnValue(null);

	await skipCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith({
		content: 'No music is currently playing.',
		flags: ['Ephemeral'],
	});
});
