import { QueueRepeatMode, useQueue } from 'discord-player';
import type { ChatInputCommandInteraction } from 'discord.js';
import { beforeEach, expect, it, vi } from 'vitest';
import repeatCommandHandler from '../repeat';

vi.mock('discord-player', () => ({
	useQueue: vi.fn(),
	QueueRepeatMode: {
		OFF: 0,
		TRACK: 1,
		QUEUE: 2,
	},
}));

const mockedUseQueue = vi.mocked(useQueue);

beforeEach(() => {
	vi.clearAllMocks();
});

function createMockInteraction(
	repeatMode: number,
): ChatInputCommandInteraction {
	return {
		options: {
			getInteger: vi.fn().mockReturnValue(repeatMode),
		},
		reply: vi.fn().mockResolvedValue({}),
	} as unknown as ChatInputCommandInteraction;
}

function createMockQueue(): NonNullable<ReturnType<typeof useQueue>> {
	return {
		setRepeatMode: vi.fn(),
	} as unknown as NonNullable<ReturnType<typeof useQueue>>;
}

it('should disable repeat mode when `repeat_mode` is OFF', async () => {
	const interaction = createMockInteraction(QueueRepeatMode.OFF);
	const mockQueue = createMockQueue();
	mockedUseQueue.mockReturnValue(mockQueue);

	await repeatCommandHandler(interaction);

	expect(mockQueue.setRepeatMode).toHaveBeenCalledWith(QueueRepeatMode.OFF);
	expect(interaction.reply).toHaveBeenCalledWith('Repeat mode disabled.');
});

it('should enable track repeat mode when `repeat_mode` is TRACK', async () => {
	const interaction = createMockInteraction(QueueRepeatMode.TRACK);
	const mockQueue = createMockQueue();
	mockedUseQueue.mockReturnValue(mockQueue);

	await repeatCommandHandler(interaction);

	expect(mockQueue.setRepeatMode).toHaveBeenCalledWith(QueueRepeatMode.TRACK);
	expect(interaction.reply).toHaveBeenCalledWith(
		'The current track will repeat indefinitely.',
	);
});

it('should enable queue repeat mode when `repeat_mode` is QUEUE', async () => {
	const interaction = createMockInteraction(QueueRepeatMode.QUEUE);
	const mockQueue = createMockQueue();
	mockedUseQueue.mockReturnValue(mockQueue);

	await repeatCommandHandler(interaction);

	expect(mockQueue.setRepeatMode).toHaveBeenCalledWith(QueueRepeatMode.QUEUE);
	expect(interaction.reply).toHaveBeenCalledWith(
		'The queue will repeat indefinitely.',
	);
});

it('should throw TypeError for unknown repeat mode', async () => {
	const UNKNOWN_MODE = 999;
	const interaction = createMockInteraction(UNKNOWN_MODE);
	const mockQueue = createMockQueue();
	mockedUseQueue.mockReturnValue(mockQueue);

	await expect(repeatCommandHandler(interaction)).rejects.toThrow(
		new TypeError('Unknown or illegal repeat mode.'),
	);

	expect(mockQueue.setRepeatMode).toHaveBeenCalledWith(UNKNOWN_MODE);
	expect(interaction.reply).not.toHaveBeenCalled();
});

it('should handle when queue is null', async () => {
	const interaction = createMockInteraction(QueueRepeatMode.OFF);
	mockedUseQueue.mockReturnValue(null);

	await repeatCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith({
		content: 'No music is currently playing.',
		flags: ['Ephemeral'],
	});
});
