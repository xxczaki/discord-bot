import type { ChatInputCommandInteraction, TextBasedChannel } from 'discord.js';
import { useQueue } from 'discord-player';
import { beforeEach, expect, it, vi } from 'vitest';
import type { ProcessingInteraction } from '../../types/ProcessingInteraction';
import relocateCommandHandler from '../relocate';

interface QueueMetadata {
	interaction: ProcessingInteraction;
}

vi.mock('discord-player', () => ({
	useQueue: vi.fn(),
}));

const mockedUseQueue = vi.mocked(useQueue);

beforeEach(() => {
	vi.clearAllMocks();
});

function createMockChannel(isSendable = true): TextBasedChannel {
	return {
		isSendable: vi.fn().mockReturnValue(isSendable),
	} as unknown as TextBasedChannel;
}

function createMockInteraction(
	channel: TextBasedChannel | null = createMockChannel(),
): ChatInputCommandInteraction {
	return {
		channel,
		reply: vi.fn().mockResolvedValue({}),
	} as unknown as ChatInputCommandInteraction;
}

function createMockQueue(
	metadata: unknown = {
		interaction: {
			user: { id: 'user-123' },
			channel: createMockChannel(),
			reply: vi.fn(),
			editReply: vi.fn(),
		},
	},
): NonNullable<ReturnType<typeof useQueue>> {
	return {
		metadata,
	} as unknown as NonNullable<ReturnType<typeof useQueue>>;
}

it('should handle null queue', async () => {
	const interaction = createMockInteraction();

	mockedUseQueue.mockReturnValue(null);

	await relocateCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith({
		content: 'No music is currently playing.',
		flags: ['Ephemeral'],
	});
});

it('should handle channel that is not sendable', async () => {
	const nonSendableChannel = createMockChannel(false);
	const interaction = createMockInteraction(nonSendableChannel);
	const mockQueue = createMockQueue();

	mockedUseQueue.mockReturnValue(mockQueue);

	await relocateCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith({
		content: 'Unable to relocate. Current channel is not accessible.',
		ephemeral: true,
	});
});

it('should handle null channel', async () => {
	const interaction = createMockInteraction(null);
	const mockQueue = createMockQueue();

	mockedUseQueue.mockReturnValue(mockQueue);

	await relocateCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith({
		content: 'Unable to relocate. Current channel is not accessible.',
		ephemeral: true,
	});
});

it('should handle queue with null metadata', async () => {
	const interaction = createMockInteraction();
	const mockQueue = createMockQueue(null);

	mockedUseQueue.mockReturnValue(mockQueue);

	await relocateCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith({
		content: 'Unable to relocate. Queue metadata is not properly initialized.',
		ephemeral: true,
	});
});

it('should handle queue with non-object metadata', async () => {
	const interaction = createMockInteraction();
	const mockQueue = createMockQueue('string-metadata');

	mockedUseQueue.mockReturnValue(mockQueue);

	await relocateCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith({
		content: 'Unable to relocate. Queue metadata is not properly initialized.',
		ephemeral: true,
	});
});

it('should handle queue with metadata missing interaction', async () => {
	const interaction = createMockInteraction();
	const mockQueue = createMockQueue({ someOtherProperty: 'value' });

	mockedUseQueue.mockReturnValue(mockQueue);

	await relocateCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith({
		content: 'Unable to relocate. Queue metadata is not properly initialized.',
		ephemeral: true,
	});
});

it('should handle queue with non-object interaction in metadata', async () => {
	const interaction = createMockInteraction();
	const mockQueue = createMockQueue({ interaction: 'string' });

	mockedUseQueue.mockReturnValue(mockQueue);

	await relocateCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith({
		content: 'Unable to relocate. Queue metadata is not properly initialized.',
		ephemeral: true,
	});
});

it('should successfully relocate queue to new channel', async () => {
	const originalChannel = createMockChannel();
	const newChannel = createMockChannel();
	const mockReply = vi.fn();
	const mockEditReply = vi.fn();

	const interaction = createMockInteraction(newChannel);
	const mockQueue = createMockQueue({
		interaction: {
			user: { id: 'user-123' },
			channel: originalChannel,
			reply: mockReply,
			editReply: mockEditReply,
		},
	});

	mockedUseQueue.mockReturnValue(mockQueue);

	await relocateCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith(
		'Queue updates will now be sent to this channel.',
	);

	const metadata = mockQueue.metadata as QueueMetadata;

	expect(metadata.interaction.channel).toBe(newChannel);
	expect(metadata.interaction.user).toEqual({ id: 'user-123' });
});

it('should preserve original interaction methods after relocation', async () => {
	const originalChannel = createMockChannel();
	const newChannel = createMockChannel();
	const mockReply = vi.fn();
	const mockEditReply = vi.fn();

	const interaction = createMockInteraction(newChannel);
	const mockQueue = createMockQueue({
		interaction: {
			user: { id: 'user-123' },
			channel: originalChannel,
			reply: mockReply,
			editReply: mockEditReply,
		},
	});

	mockedUseQueue.mockReturnValue(mockQueue);

	await relocateCommandHandler(interaction);

	const metadata = mockQueue.metadata as QueueMetadata;

	expect(typeof metadata.interaction.reply).toBe('function');
	expect(typeof metadata.interaction.editReply).toBe('function');
});
