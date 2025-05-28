import { useQueue } from 'discord-player';
import type { ChatInputCommandInteraction } from 'discord.js';
import { beforeEach, expect, it, vi } from 'vitest';
import volumeCommandHandler from '../volume';

const EXAMPLE_VOLUME = 75;

vi.mock('discord-player', () => ({
	useQueue: vi.fn(),
}));

const mockedUseQueue = vi.mocked(useQueue);

beforeEach(() => {
	vi.clearAllMocks();
});

function createMockInteraction(
	volume: number = EXAMPLE_VOLUME,
): ChatInputCommandInteraction {
	return {
		options: {
			getInteger: vi.fn().mockReturnValue(volume),
		},
		reply: vi.fn().mockResolvedValue({}),
	} as unknown as ChatInputCommandInteraction;
}

function createMockQueue(): NonNullable<ReturnType<typeof useQueue>> {
	return {
		node: {
			setVolume: vi.fn(),
		},
	} as unknown as NonNullable<ReturnType<typeof useQueue>>;
}

it('should set volume and reply with confirmation message', async () => {
	const interaction = createMockInteraction(50);
	const mockQueue = createMockQueue();
	mockedUseQueue.mockReturnValue(mockQueue);

	await volumeCommandHandler(interaction);

	expect(interaction.options.getInteger).toHaveBeenCalledWith('value', true);
	expect(mockQueue.node.setVolume).toHaveBeenCalledWith(50);
	expect(interaction.reply).toHaveBeenCalledWith('Volume changed to `50`.');
});

it('should handle when queue is null', async () => {
	const interaction = createMockInteraction();
	mockedUseQueue.mockReturnValue(null);

	await volumeCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith(
		`Volume changed to \`${EXAMPLE_VOLUME}\`.`,
	);
});
