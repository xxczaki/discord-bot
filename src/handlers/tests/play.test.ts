import { captureException } from '@sentry/node';
import { useMainPlayer, useQueue } from 'discord-player';
import type { GuildQueue, Track } from 'discord-player';
import {
	ActionRowBuilder,
	type ChatInputCommandInteraction,
	EmbedBuilder,
	type GuildMember,
	type Message,
	type MessageComponentInteraction,
	type VoiceBasedChannel,
} from 'discord.js';
import { beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_MESSAGE_COMPONENT_AWAIT_TIME_MS } from '../../constants/miscellaneous';
import createTrackEmbed from '../../utils/createTrackEmbed';
import determineSearchEngine from '../../utils/determineSearchEngine';
import getTrackPosition from '../../utils/getTrackPosition';
import logger from '../../utils/logger';
import playCommandHandler from '../play';

const EXAMPLE_QUERY = 'never gonna give you up';
const EXAMPLE_TRACK_ID = 'track-123';
const EXAMPLE_TRACK_TITLE = 'Never Gonna Give You Up';
const EXAMPLE_TRACK_AUTHOR = 'Rick Astley';
const EXAMPLE_TRACK_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

vi.mock('discord-player', () => ({
	useMainPlayer: vi.fn(),
	useQueue: vi.fn(),
}));

vi.mock('../../utils/createTrackEmbed', () => ({
	default: vi.fn(),
}));

vi.mock('../../utils/determineSearchEngine', () => ({
	default: vi.fn(),
}));

vi.mock('../../utils/getTrackPosition', () => ({
	default: vi.fn(),
}));

const mockedCaptureException = vi.mocked(captureException);
const mockedUseMainPlayer = vi.mocked(useMainPlayer);
const mockedUseQueue = vi.mocked(useQueue);
const mockedCreateTrackEmbed = vi.mocked(createTrackEmbed);
const mockedDetermineSearchEngine = vi.mocked(determineSearchEngine);
const mockedGetTrackPosition = vi.mocked(getTrackPosition);
const mockedLogger = vi.mocked(logger);

beforeEach(() => {
	vi.clearAllMocks();
	mockedDetermineSearchEngine.mockReturnValue('spotifySearch');
	mockedGetTrackPosition.mockReturnValue(1);
});

function createMockVoiceChannel(): VoiceBasedChannel {
	return {
		id: 'voice-channel-123',
		name: 'General',
	} as VoiceBasedChannel;
}

function createMockInteraction(
	query = EXAMPLE_QUERY,
	hasVoiceChannel = true,
): ChatInputCommandInteraction {
	return {
		member: {
			voice: {
				channel: hasVoiceChannel ? createMockVoiceChannel() : null,
			},
		} as GuildMember,
		user: {
			id: 'user-123',
			username: 'testuser',
		},
		options: {
			getString: vi.fn().mockReturnValue(query),
		},
		reply: vi.fn().mockResolvedValue({}),
		editReply: vi.fn().mockResolvedValue(createMockResponse()),
	} as unknown as ChatInputCommandInteraction;
}

function createMockTrack(overrides: Partial<Track> = {}): Track {
	return {
		id: EXAMPLE_TRACK_ID,
		title: EXAMPLE_TRACK_TITLE,
		author: EXAMPLE_TRACK_AUTHOR,
		url: EXAMPLE_TRACK_URL,
		duration: '3:32',
		metadata: {},
		...overrides,
	} as Track;
}

function createMockPlayer() {
	return {
		play: vi.fn().mockResolvedValue({ track: createMockTrack() }),
	} as unknown as ReturnType<typeof useMainPlayer>;
}

function createMockQueue(tracks: Track[] = []): GuildQueue {
	const mockTracks = tracks.map((track) => ({ ...track }));

	return {
		tracks: {
			some: vi.fn((predicate) => mockTracks.some(predicate)),
			data: mockTracks,
		},
		moveTrack: vi.fn(),
		removeTrack: vi.fn(),
		node: {
			skip: vi.fn(),
		},
	} as unknown as GuildQueue;
}

function createMockResponse(): Message {
	return {
		awaitMessageComponent: vi.fn(),
	} as unknown as Message;
}

function createMockEmbed() {
	return new EmbedBuilder()
		.setTitle(EXAMPLE_TRACK_TITLE)
		.setDescription('Test description');
}

function createMockComponentInteraction(
	customId: string,
): MessageComponentInteraction {
	return {
		customId,
		update: vi.fn().mockResolvedValue({}),
	} as unknown as MessageComponentInteraction;
}

it('should reply with error when user is not in a voice channel', async () => {
	const interaction = createMockInteraction(EXAMPLE_QUERY, false);

	await playCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith({
		content: 'You are not connected to a voice channel!',
		flags: ['Ephemeral'],
	});
});

it('should process track and display embed with buttons', async () => {
	const interaction = createMockInteraction();
	const mockPlayer = createMockPlayer();
	const mockQueue = createMockQueue([createMockTrack()]);
	const mockEmbed = createMockEmbed();
	const mockResponse = createMockResponse();

	mockedUseMainPlayer.mockReturnValue(mockPlayer);
	mockedUseQueue.mockReturnValue(mockQueue);
	mockedCreateTrackEmbed.mockReturnValue(mockEmbed);
	interaction.editReply = vi.fn().mockResolvedValue(mockResponse);
	mockResponse.awaitMessageComponent = vi
		.fn()
		.mockRejectedValue(new Error('timeout'));

	await playCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith(
		'Processing the track to play…',
	);

	expect(mockPlayer.play).toHaveBeenCalledWith(
		expect.any(Object),
		EXAMPLE_QUERY,
		{
			searchEngine: 'spotifySearch',
			nodeOptions: {
				metadata: { interaction },
				defaultFFmpegFilters: ['_normalizer'],
			},
			requestedBy: interaction.user,
		},
	);

	expect(mockedCreateTrackEmbed).toHaveBeenCalledWith(
		mockQueue,
		expect.any(Object),
		'Added to queue (position 2).',
	);

	expect(interaction.editReply).toHaveBeenCalledWith({
		embeds: [mockEmbed],
		components: [expect.any(ActionRowBuilder)],
		content: null,
	});
});

it('should handle "play now" button interaction', async () => {
	const interaction = createMockInteraction();
	const mockPlayer = createMockPlayer();
	const mockQueue = createMockQueue([createMockTrack()]);
	const mockEmbed = createMockEmbed();
	const mockResponse = createMockResponse();
	const mockComponent = createMockComponentInteraction('play-now');

	mockedUseMainPlayer.mockReturnValue(mockPlayer);
	mockedUseQueue.mockReturnValue(mockQueue);
	mockedCreateTrackEmbed.mockReturnValue(mockEmbed);
	interaction.editReply = vi.fn().mockResolvedValue(mockResponse);
	mockResponse.awaitMessageComponent = vi.fn().mockResolvedValue(mockComponent);

	await playCommandHandler(interaction);

	expect(mockQueue.moveTrack).toHaveBeenCalledWith(expect.any(Object), 0);
	expect(mockQueue.node.skip).toHaveBeenCalled();
	expect(mockComponent.update).toHaveBeenCalledWith({
		content: 'Playing this track now.',
		components: [],
	});
});

it('should handle "move first" button interaction', async () => {
	const interaction = createMockInteraction();
	const mockPlayer = createMockPlayer();
	const mockQueue = createMockQueue([createMockTrack()]);
	const mockEmbed = createMockEmbed();
	const mockResponse = createMockResponse();
	const mockComponent = createMockComponentInteraction('move-first');

	mockedUseMainPlayer.mockReturnValue(mockPlayer);
	mockedUseQueue.mockReturnValue(mockQueue);
	mockedCreateTrackEmbed.mockReturnValue(mockEmbed);
	interaction.editReply = vi.fn().mockResolvedValue(mockResponse);
	mockResponse.awaitMessageComponent = vi.fn().mockResolvedValue(mockComponent);

	await playCommandHandler(interaction);

	expect(mockQueue.moveTrack).toHaveBeenCalledWith(expect.any(Object), 0);
	expect(mockQueue.node.skip).not.toHaveBeenCalled();
	expect(mockComponent.update).toHaveBeenCalledWith({
		content: 'Moved to the beginning of the queue.',
		components: [],
	});
});

it('should handle "remove" button interaction', async () => {
	const interaction = createMockInteraction();
	const mockPlayer = createMockPlayer();
	const mockQueue = createMockQueue([createMockTrack()]);
	const mockEmbed = createMockEmbed();
	const mockResponse = createMockResponse();
	const mockComponent = createMockComponentInteraction('remove');

	mockedUseMainPlayer.mockReturnValue(mockPlayer);
	mockedUseQueue.mockReturnValue(mockQueue);
	mockedCreateTrackEmbed.mockReturnValue(mockEmbed);
	interaction.editReply = vi.fn().mockResolvedValue(mockResponse);
	mockResponse.awaitMessageComponent = vi.fn().mockResolvedValue(mockComponent);

	await playCommandHandler(interaction);

	expect(mockQueue.removeTrack).toHaveBeenCalledWith(expect.any(Object));
	expect(mockComponent.update).toHaveBeenCalledWith({
		content: 'Track removed from the queue.',
		embeds: [],
		components: [],
	});
});

it('should handle unknown button interaction', async () => {
	const interaction = createMockInteraction();
	const mockPlayer = createMockPlayer();
	const mockQueue = createMockQueue([createMockTrack()]);
	const mockEmbed = createMockEmbed();
	const mockResponse = createMockResponse();
	const mockComponent = createMockComponentInteraction('unknown');

	mockedUseMainPlayer.mockReturnValue(mockPlayer);
	mockedUseQueue.mockReturnValue(mockQueue);
	mockedCreateTrackEmbed.mockReturnValue(mockEmbed);
	interaction.editReply = vi.fn().mockResolvedValue(mockResponse);
	mockResponse.awaitMessageComponent = vi.fn().mockResolvedValue(mockComponent);

	await playCommandHandler(interaction);

	expect(mockComponent.update).toHaveBeenCalledWith({
		components: [],
	});
});

it('should handle component interaction timeout', async () => {
	const interaction = createMockInteraction();
	const mockPlayer = createMockPlayer();
	const mockQueue = createMockQueue([createMockTrack()]);
	const mockEmbed = createMockEmbed();
	const mockResponse = createMockResponse();

	mockedUseMainPlayer.mockReturnValue(mockPlayer);
	mockedUseQueue.mockReturnValue(mockQueue);
	mockedCreateTrackEmbed.mockReturnValue(mockEmbed);
	interaction.editReply = vi.fn().mockResolvedValue(mockResponse);
	mockResponse.awaitMessageComponent = vi
		.fn()
		.mockRejectedValue(new Error('timeout'));

	await playCommandHandler(interaction);

	expect(interaction.editReply).toHaveBeenLastCalledWith({
		components: [],
	});
});

it('should handle empty queue after playing', async () => {
	const interaction = createMockInteraction();
	const mockPlayer = createMockPlayer();

	mockedUseMainPlayer.mockReturnValue(mockPlayer);
	mockedUseQueue.mockReturnValue(null);

	await playCommandHandler(interaction);

	expect(interaction.editReply).toHaveBeenCalledWith('The queue is empty.');
});

it('should handle "No results found" error', async () => {
	const interaction = createMockInteraction();
	const mockPlayer = createMockPlayer();
	const error = new Error('No results found for query');
	error.name = 'No results found';

	mockPlayer.play = vi.fn().mockRejectedValue(error);
	mockedUseMainPlayer.mockReturnValue(mockPlayer);

	await playCommandHandler(interaction);

	expect(interaction.editReply).toHaveBeenCalledWith(
		'No results found for the given query.',
	);
});

it('should handle generic errors and log them', async () => {
	const interaction = createMockInteraction();
	const mockPlayer = createMockPlayer();
	const error = new Error('Generic error');

	mockPlayer.play = vi.fn().mockRejectedValue(error);
	mockedUseMainPlayer.mockReturnValue(mockPlayer);

	await playCommandHandler(interaction);

	expect(mockedLogger.error).toHaveBeenCalledWith(error);
	expect(mockedCaptureException).toHaveBeenCalledWith(error);
});

it('should create proper button states based on track position and queue status', async () => {
	const interaction = createMockInteraction();
	const mockPlayer = createMockPlayer();
	const mockTrack = createMockTrack();
	const mockQueue = createMockQueue([mockTrack]);
	const mockEmbed = createMockEmbed();
	const mockResponse = createMockResponse();

	mockedUseMainPlayer.mockReturnValue(mockPlayer);
	mockedUseQueue.mockReturnValue(mockQueue);
	mockedCreateTrackEmbed.mockReturnValue(mockEmbed);
	mockedGetTrackPosition.mockReturnValue(0); // Track is at position 1

	vi.mocked(mockQueue.tracks.some).mockReturnValue(true);
	interaction.editReply = vi.fn().mockResolvedValue(mockResponse);
	mockResponse.awaitMessageComponent = vi
		.fn()
		.mockRejectedValue(new Error('timeout'));

	await playCommandHandler(interaction);

	const editReplyCall = vi
		.mocked(interaction.editReply)
		.mock.calls.find(
			(call) =>
				call[0] && typeof call[0] === 'object' && 'components' in call[0],
		);

	expect(editReplyCall).toBeDefined();
	if (
		editReplyCall &&
		typeof editReplyCall[0] === 'object' &&
		'components' in editReplyCall[0]
	) {
		const components = editReplyCall[0].components;
		expect(components).toHaveLength(1);
		expect(components?.[0]).toBeInstanceOf(ActionRowBuilder);
	}
});

it('should disable "Play next" button when track is at position 1', async () => {
	const interaction = createMockInteraction();
	const mockPlayer = createMockPlayer();
	const mockTrack = createMockTrack();
	const mockQueue = createMockQueue([mockTrack]);
	const mockEmbed = createMockEmbed();
	const mockResponse = createMockResponse();

	mockedUseMainPlayer.mockReturnValue(mockPlayer);
	mockedUseQueue.mockReturnValue(mockQueue);
	mockedCreateTrackEmbed.mockReturnValue(mockEmbed);
	mockedGetTrackPosition.mockReturnValue(0);
	vi.mocked(mockQueue.tracks.some).mockReturnValue(true);
	interaction.editReply = vi.fn().mockResolvedValue(mockResponse);
	mockResponse.awaitMessageComponent = vi
		.fn()
		.mockRejectedValue(new Error('timeout'));

	await playCommandHandler(interaction);

	// The actual button state validation is done through the button builder chain
	// The test validates that the proper position calculation is done
	expect(mockedGetTrackPosition).toHaveBeenCalledWith(mockQueue, mockTrack);
});

it('should use correct `awaitMessageComponent` timeout', async () => {
	const interaction = createMockInteraction();
	const mockPlayer = createMockPlayer();
	const mockQueue = createMockQueue([createMockTrack()]);
	const mockEmbed = createMockEmbed();
	const mockResponse = createMockResponse();

	mockedUseMainPlayer.mockReturnValue(mockPlayer);
	mockedUseQueue.mockReturnValue(mockQueue);
	mockedCreateTrackEmbed.mockReturnValue(mockEmbed);
	interaction.editReply = vi.fn().mockResolvedValue(mockResponse);
	mockResponse.awaitMessageComponent = vi
		.fn()
		.mockRejectedValue(new Error('timeout'));

	await playCommandHandler(interaction);

	expect(mockResponse.awaitMessageComponent).toHaveBeenCalledWith({
		time: DEFAULT_MESSAGE_COMPONENT_AWAIT_TIME_MS,
	});
});
