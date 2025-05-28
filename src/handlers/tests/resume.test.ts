import { useQueue } from 'discord-player';
import type { ChatInputCommandInteraction } from 'discord.js';
import { beforeEach, expect, it, vi } from 'vitest';
import resumeCommandHandler from '../resume';

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
			setPaused: vi.fn(),
		},
	} as unknown as NonNullable<ReturnType<typeof useQueue>>;
}

it('should resume the track and reply with success message', async () => {
	const interaction = createMockInteraction();
	const mockQueue = createMockQueue();
	mockedUseQueue.mockReturnValue(mockQueue);

	await resumeCommandHandler(interaction);

	expect(mockQueue.node.setPaused).toHaveBeenCalledWith(false);
	expect(interaction.reply).toHaveBeenCalledWith('Track resumed.');
});

it('should handle when queue is null', async () => {
	const interaction = createMockInteraction();
	mockedUseQueue.mockReturnValue(null);

	await resumeCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith('Track resumed.');
});
