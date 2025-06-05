import { useQueue } from 'discord-player';
import type { ChatInputCommandInteraction } from 'discord.js';
import { beforeEach, expect, it, vi } from 'vitest';
import pauseCommandHandler from '../pause';

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

function createMockQueue(
	isPaused = false,
): NonNullable<ReturnType<typeof useQueue>> {
	return {
		node: {
			isPaused: vi.fn().mockReturnValue(isPaused),
			setPaused: vi.fn(),
		},
	} as unknown as NonNullable<ReturnType<typeof useQueue>>;
}

it('should reply early when track is already paused', async () => {
	const interaction = createMockInteraction();
	const mockQueue = createMockQueue(true);
	mockedUseQueue.mockReturnValue(mockQueue);

	await pauseCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith(
		'The track is already paused. Maybe you want to `/resume` it instead?',
	);
	expect(mockQueue.node.setPaused).not.toHaveBeenCalled();
});

it('should pause the track when not already paused', async () => {
	const interaction = createMockInteraction();
	const mockQueue = createMockQueue(false);
	mockedUseQueue.mockReturnValue(mockQueue);

	await pauseCommandHandler(interaction);

	expect(mockQueue.node.setPaused).toHaveBeenCalledWith(true);
	expect(interaction.reply).toHaveBeenCalledWith('Track paused.');
});

it('should handle when queue is null', async () => {
	const interaction = createMockInteraction();
	mockedUseQueue.mockReturnValue(null);

	await pauseCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith({
		content: 'No music is currently playing.',
		flags: ['Ephemeral'],
	});
});
