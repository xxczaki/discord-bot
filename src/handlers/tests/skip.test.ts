import type { ChatInputCommandInteraction } from 'discord.js';
import { useQueue } from 'discord-player';
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
		editReply: vi.fn().mockResolvedValue({}),
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
	expect(interaction.editReply).toHaveBeenCalledWith('Track skipped.');
});

it('should call `sendTyping` when channel is sendable', async () => {
	const sendTyping = vi.fn().mockResolvedValue(undefined);
	const interaction = {
		...createMockInteraction(),
		channel: { isSendable: () => true, sendTyping },
	} as unknown as ChatInputCommandInteraction;
	const mockQueue = createMockQueue();
	mockedUseQueue.mockReturnValue(mockQueue);

	await skipCommandHandler(interaction);

	expect(sendTyping).toHaveBeenCalled();
});

it('should handle when queue is null', async () => {
	const interaction = createMockInteraction();
	mockedUseQueue.mockReturnValue(null);

	await skipCommandHandler(interaction);

	expect(interaction.editReply).toHaveBeenCalledWith(
		'No music is currently playing.',
	);
});
