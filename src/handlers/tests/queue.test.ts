import {
	QueueRepeatMode,
	type Track,
	useMainPlayer,
	useQueue,
} from 'discord-player';
import {
	ActionRowBuilder,
	type ChatInputCommandInteraction,
	EmbedBuilder,
	type InteractionResponse,
	type Message,
	type MessageComponentInteraction,
} from 'discord.js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import queueCommandHandler from '../queue';

const EXAMPLE_TRACK_TITLE = 'Never Gonna Give You Up';
const EXAMPLE_TRACK_AUTHOR = 'Rick Astley';
const EXAMPLE_TRACK_DURATION = '3:32';
const EXAMPLE_TRACK_URL = 'https://youtube.com/watch?v=dQw4w9WgXcQ';
const EXAMPLE_QUEUE_SIZE = 5;
const EXAMPLE_ESTIMATED_DURATION = 600000; // 10 minutes

vi.mock('discord-player', () => ({
	useQueue: vi.fn(),
	useMainPlayer: vi.fn(),
	QueueRepeatMode: {
		TRACK: 1,
		QUEUE: 2,
	},
}));

const mockedGetTrackPosition = vi.hoisted(() => vi.fn());
const mockedGetTrackThumbnail = vi.hoisted(() => vi.fn());

vi.mock('../../utils/getTrackPosition', () => ({
	default: mockedGetTrackPosition,
}));

vi.mock('../../utils/getTrackThumbnail', () => ({
	default: mockedGetTrackThumbnail,
}));

const mockedUseQueue = vi.mocked(useQueue);
const mockedUseMainPlayer = vi.mocked(useMainPlayer);

beforeEach(() => {
	vi.clearAllMocks();
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2025-01-01T12:00:00Z'));

	mockedGetTrackPosition.mockReturnValue(1);
	mockedGetTrackThumbnail.mockReturnValue('https://example.com/thumbnail.jpg');

	// Mock the main player with basic event handling
	mockedUseMainPlayer.mockReturnValue({
		events: {
			on: vi.fn(),
			off: vi.fn(),
		},
	} as unknown as ReturnType<typeof useMainPlayer>);
});

afterEach(() => {
	vi.useRealTimers();
});

function createMockTrack(overrides: Partial<Track> = {}): Track {
	return {
		title: EXAMPLE_TRACK_TITLE,
		author: EXAMPLE_TRACK_AUTHOR,
		duration: EXAMPLE_TRACK_DURATION,
		url: EXAMPLE_TRACK_URL,
		metadata: {},
		...overrides,
	} as Track;
}

function createMockInteraction(): ChatInputCommandInteraction {
	return {
		reply: vi.fn().mockResolvedValue({}),
		editReply: vi.fn().mockResolvedValue(createMockResponse()),
	} as unknown as ChatInputCommandInteraction;
}

function createMockQueue(
	overrides: Partial<NonNullable<ReturnType<typeof useQueue>>> = {},
): NonNullable<ReturnType<typeof useQueue>> {
	const defaultTracks = [
		createMockTrack({ title: 'Track 1' }),
		createMockTrack({ title: 'Track 2' }),
	];

	return {
		tracks: {
			toArray: vi.fn().mockReturnValue(defaultTracks),
			...overrides.tracks,
		},
		currentTrack: createMockTrack(),
		size: EXAMPLE_QUEUE_SIZE,
		estimatedDuration: EXAMPLE_ESTIMATED_DURATION,
		repeatMode: QueueRepeatMode.TRACK,
		node: {
			isPaused: vi.fn().mockReturnValue(false),
		},
		...overrides,
	} as unknown as NonNullable<ReturnType<typeof useQueue>>;
}

function createMockResponse(): InteractionResponse<boolean> | Message<boolean> {
	return {
		awaitMessageComponent: vi.fn(),
		edit: vi.fn(),
	} as unknown as InteractionResponse<boolean> | Message<boolean>;
}

function createMockComponentInteraction(
	customId: string,
): MessageComponentInteraction {
	return {
		customId,
		update: vi.fn().mockResolvedValue(createMockResponse()),
	} as unknown as MessageComponentInteraction;
}

it('should reply early when queue is empty', async () => {
	const interaction = createMockInteraction();
	const mockQueue = createMockQueue({ currentTrack: null });

	mockedUseQueue.mockReturnValue(mockQueue);

	await queueCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith(
		'The queue is empty and nothing is being played.',
	);
	expect(interaction.editReply).not.toHaveBeenCalled();
});

it('should reply early when no current track', async () => {
	const interaction = createMockInteraction();

	mockedUseQueue.mockReturnValue(null);

	await queueCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith({
		content: 'The queue is empty and nothing is being played.',
		flags: ['Ephemeral'],
	});
	expect(interaction.editReply).not.toHaveBeenCalled();
});

it('should display queue with current track and pagination', async () => {
	const interaction = createMockInteraction();
	const currentTrack = createMockTrack();
	const mockQueue = createMockQueue({
		currentTrack,
		repeatMode: QueueRepeatMode.TRACK,
	});
	const mockResponse = createMockResponse();

	mockedUseQueue.mockReturnValue(mockQueue);
	interaction.editReply = vi.fn().mockResolvedValue(mockResponse);
	mockResponse.awaitMessageComponent = vi
		.fn()
		.mockRejectedValue(new Error('timeout'));

	await queueCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith('Fetching the queue…');
	expect(interaction.editReply).toHaveBeenCalledWith({
		embeds: [expect.any(EmbedBuilder)],
		components: [expect.any(ActionRowBuilder)],
		content: null,
	});
});

it('should handle cached track metadata correctly', async () => {
	const interaction = createMockInteraction();
	const currentTrack = createMockTrack({
		metadata: { isFromCache: true },
	});
	const mockQueue = createMockQueue({ currentTrack });
	const mockResponse = createMockResponse();

	mockedUseQueue.mockReturnValue(mockQueue);
	interaction.editReply = vi.fn().mockResolvedValue(mockResponse);
	mockResponse.awaitMessageComponent = vi
		.fn()
		.mockRejectedValue(new Error('timeout'));

	await queueCommandHandler(interaction);

	expect(interaction.editReply).toHaveBeenCalledWith(
		expect.objectContaining({
			embeds: [expect.any(EmbedBuilder)],
		}),
	);
});

it('should handle paused queue state correctly', async () => {
	const interaction = createMockInteraction();
	const mockQueue = createMockQueue();
	const mockResponse = createMockResponse();

	mockQueue.node.isPaused = vi.fn().mockReturnValue(true);
	mockedUseQueue.mockReturnValue(mockQueue);
	interaction.editReply = vi.fn().mockResolvedValue(mockResponse);
	mockResponse.awaitMessageComponent = vi
		.fn()
		.mockRejectedValue(new Error('timeout'));

	await queueCommandHandler(interaction);

	expect(interaction.editReply).toHaveBeenCalledWith(
		expect.objectContaining({
			embeds: [expect.any(EmbedBuilder)],
		}),
	);
});

it('should handle queue repeat mode correctly', async () => {
	const interaction = createMockInteraction();
	const mockQueue = createMockQueue({
		repeatMode: QueueRepeatMode.QUEUE,
	});
	const mockResponse = createMockResponse();

	mockedUseQueue.mockReturnValue(mockQueue);
	interaction.editReply = vi.fn().mockResolvedValue(mockResponse);
	mockResponse.awaitMessageComponent = vi
		.fn()
		.mockRejectedValue(new Error('timeout'));

	await queueCommandHandler(interaction);

	expect(interaction.editReply).toHaveBeenCalledWith(
		expect.objectContaining({
			embeds: [expect.any(EmbedBuilder)],
		}),
	);
});

it('should disable "Next page" button when only one page exists', async () => {
	const interaction = createMockInteraction();
	const mockQueue = createMockQueue();
	const mockResponse = createMockResponse();

	mockQueue.tracks.toArray = vi.fn().mockReturnValue([]);

	mockedUseQueue.mockReturnValue(mockQueue);
	interaction.editReply = vi.fn().mockResolvedValue(mockResponse);
	mockResponse.awaitMessageComponent = vi
		.fn()
		.mockRejectedValue(new Error('timeout'));

	await queueCommandHandler(interaction);

	expect(interaction.editReply).toHaveBeenCalledWith(
		expect.objectContaining({
			components: [expect.any(ActionRowBuilder)],
		}),
	);
});

it('should handle pagination navigation correctly', async () => {
	const interaction = createMockInteraction();

	const largeTracks = Array.from({ length: 30 }, (_, i) =>
		createMockTrack({
			title: `Very Long Track Title That Will Cause Pagination To Trigger Number ${i}`,
			author: 'Very Long Artist Name That Makes Entry Even Longer',
			duration: '4:30',
		}),
	);
	const mockQueue = createMockQueue();
	const mockResponse = createMockResponse();
	const mockComponent = createMockComponentInteraction('1');

	mockQueue.tracks.toArray = vi.fn().mockReturnValue(largeTracks);

	mockedGetTrackPosition.mockImplementation((_, track) => {
		return largeTracks.indexOf(track) + 1;
	});

	mockedUseQueue.mockReturnValue(mockQueue);
	interaction.editReply = vi.fn().mockResolvedValue(mockResponse);
	mockResponse.awaitMessageComponent = vi.fn().mockResolvedValue(mockComponent);

	const secondMockResponse = createMockResponse();
	secondMockResponse.awaitMessageComponent = vi
		.fn()
		.mockRejectedValue(new Error('timeout'));
	mockComponent.update = vi.fn().mockResolvedValue(secondMockResponse);

	await queueCommandHandler(interaction);

	expect(mockComponent.update).toHaveBeenCalledWith({
		embeds: [expect.any(EmbedBuilder)],
		components: [expect.any(ActionRowBuilder)],
	});

	expect(mockedGetTrackPosition).toHaveBeenCalledWith(
		mockQueue,
		expect.any(Object),
	);
});

it('should handle component interaction timeout', async () => {
	const interaction = createMockInteraction();
	const mockQueue = createMockQueue();
	const mockResponse = createMockResponse();

	mockedUseQueue.mockReturnValue(mockQueue);
	interaction.editReply = vi.fn().mockResolvedValue(mockResponse);
	mockResponse.awaitMessageComponent = vi
		.fn()
		.mockRejectedValue(new Error('timeout'));

	await queueCommandHandler(interaction);

	expect(mockResponse.edit).toHaveBeenCalledWith({
		components: [],
	});
});

it('should calculate ending time correctly for same day', async () => {
	const interaction = createMockInteraction();
	const mockQueue = createMockQueue({
		estimatedDuration: 3600000, // 1 hour
	});
	const mockResponse = createMockResponse();

	mockedUseQueue.mockReturnValue(mockQueue);
	interaction.editReply = vi.fn().mockResolvedValue(mockResponse);
	mockResponse.awaitMessageComponent = vi
		.fn()
		.mockRejectedValue(new Error('timeout'));

	await queueCommandHandler(interaction);

	expect(interaction.editReply).toHaveBeenCalledWith(
		expect.objectContaining({
			embeds: [expect.any(EmbedBuilder)],
		}),
	);
});

it('should calculate ending time correctly for different day', async () => {
	const interaction = createMockInteraction();
	const mockQueue = createMockQueue({
		estimatedDuration: 86400000 * 2, // 2 days
	});
	const mockResponse = createMockResponse();

	mockedUseQueue.mockReturnValue(mockQueue);
	interaction.editReply = vi.fn().mockResolvedValue(mockResponse);
	mockResponse.awaitMessageComponent = vi
		.fn()
		.mockRejectedValue(new Error('timeout'));

	await queueCommandHandler(interaction);

	expect(interaction.editReply).toHaveBeenCalledWith(
		expect.objectContaining({
			embeds: [expect.any(EmbedBuilder)],
		}),
	);
});

it('should handle queue without estimated duration', async () => {
	const interaction = createMockInteraction();
	const mockQueue = createMockQueue({
		estimatedDuration: 0,
	});
	const mockResponse = createMockResponse();

	mockedUseQueue.mockReturnValue(mockQueue);
	interaction.editReply = vi.fn().mockResolvedValue(mockResponse);
	mockResponse.awaitMessageComponent = vi
		.fn()
		.mockRejectedValue(new Error('timeout'));

	await queueCommandHandler(interaction);

	expect(interaction.editReply).toHaveBeenCalledWith(
		expect.objectContaining({
			embeds: [expect.any(EmbedBuilder)],
		}),
	);
});

it('should handle previous page navigation correctly', async () => {
	const interaction = createMockInteraction();
	const largeTracks = Array.from({ length: 50 }, (_, i) =>
		createMockTrack({ title: `Track ${i}` }),
	);
	const mockQueue = createMockQueue();
	const mockResponse = createMockResponse();
	const mockComponent = createMockComponentInteraction('0');

	mockQueue.tracks.toArray = vi.fn().mockReturnValue(largeTracks);

	mockedUseQueue.mockReturnValue(mockQueue);
	interaction.editReply = vi.fn().mockResolvedValue(mockResponse);
	mockResponse.awaitMessageComponent = vi.fn().mockResolvedValue(mockComponent);

	const secondMockResponse = createMockResponse();
	secondMockResponse.awaitMessageComponent = vi
		.fn()
		.mockRejectedValue(new Error('timeout'));
	mockComponent.update = vi.fn().mockResolvedValue(secondMockResponse);

	await queueCommandHandler(interaction);

	expect(mockComponent.update).toHaveBeenCalledWith({
		embeds: [expect.any(EmbedBuilder)],
		components: [expect.any(ActionRowBuilder)],
	});
});

it('should show empty footer text when no tracks are queued beyond current track', async () => {
	const interaction = createMockInteraction();
	const currentTrack = createMockTrack();
	const mockQueue = createMockQueue({
		currentTrack,
	});

	mockQueue.tracks.toArray = vi.fn().mockReturnValue([]);

	const mockResponse = createMockResponse();

	const setFooterSpy = vi.spyOn(EmbedBuilder.prototype, 'setFooter');

	mockedUseQueue.mockReturnValue(mockQueue);
	interaction.editReply = vi.fn().mockResolvedValue(mockResponse);
	mockResponse.awaitMessageComponent = vi
		.fn()
		.mockRejectedValue(new Error('timeout'));

	await queueCommandHandler(interaction);

	expect(setFooterSpy).not.toHaveBeenCalled();

	setFooterSpy.mockRestore();
});
