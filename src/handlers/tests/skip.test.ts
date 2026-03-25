import { ButtonStyle, type ChatInputCommandInteraction } from 'discord.js';
import { useQueue } from 'discord-player';
import { beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_MESSAGE_COMPONENT_AWAIT_TIME_MS } from '../../constants/miscellaneous';
import skipCommandHandler from '../skip';

vi.mock('discord-player', () => ({
	useQueue: vi.fn(),
}));

const mockedUseQueue = vi.mocked(useQueue);

beforeEach(() => {
	vi.clearAllMocks();
});

function createMockResponse() {
	return {
		awaitMessageComponent: vi.fn().mockRejectedValue(new Error('timeout')),
		edit: vi.fn().mockResolvedValue(undefined),
	};
}

function createMockInteraction(
	response = createMockResponse(),
): ChatInputCommandInteraction {
	return {
		editReply: vi.fn().mockResolvedValue(response),
	} as unknown as ChatInputCommandInteraction;
}

function createMockQueue(): NonNullable<ReturnType<typeof useQueue>> {
	return {
		node: {
			skip: vi.fn(),
		},
		history: {
			previous: vi.fn().mockResolvedValue(undefined),
		},
	} as unknown as NonNullable<ReturnType<typeof useQueue>>;
}

it('should skip the track and reply with undo button', async () => {
	const interaction = createMockInteraction();
	const mockQueue = createMockQueue();
	mockedUseQueue.mockReturnValue(mockQueue);

	await skipCommandHandler(interaction);

	expect(mockQueue.node.skip).toHaveBeenCalledWith();
	expect(interaction.editReply).toHaveBeenCalledWith({
		content: 'Track skipped.',
		components: [
			expect.objectContaining({
				components: expect.arrayContaining([
					expect.objectContaining({
						data: expect.objectContaining({
							custom_id: 'undo-skip',
							label: 'Undo',
							style: ButtonStyle.Secondary,
						}),
					}),
				]),
			}),
		],
	});
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

it('should undo skip when undo button is clicked', async () => {
	const mockUndoAnswer = {
		customId: 'undo-skip',
		update: vi.fn().mockResolvedValue(undefined),
	};
	const mockResponse = {
		awaitMessageComponent: vi.fn().mockResolvedValue(mockUndoAnswer),
		edit: vi.fn(),
	};
	const interaction = createMockInteraction(mockResponse);
	const mockQueue = createMockQueue();
	mockedUseQueue.mockReturnValue(mockQueue);

	await skipCommandHandler(interaction);

	expect(mockResponse.awaitMessageComponent).toHaveBeenCalledWith({
		time: DEFAULT_MESSAGE_COMPONENT_AWAIT_TIME_MS,
	});
	expect(mockQueue.history.previous).toHaveBeenCalledWith(true);
	expect(mockUndoAnswer.update).toHaveBeenCalledWith({
		content: '↩️ Skip was undone.',
		components: [],
	});
});

it('should remove undo button on timeout', async () => {
	const mockResponse = createMockResponse();
	const interaction = createMockInteraction(mockResponse);
	const mockQueue = createMockQueue();
	mockedUseQueue.mockReturnValue(mockQueue);

	await skipCommandHandler(interaction);

	expect(mockResponse.edit).toHaveBeenCalledWith({ components: [] });
});
