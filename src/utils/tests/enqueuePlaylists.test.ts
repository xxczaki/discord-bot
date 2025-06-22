import {
	ActionRowBuilder,
	type ButtonInteraction,
	type Collection,
	EmbedBuilder,
	type Message,
	type StringSelectMenuInteraction,
	type TextBasedChannel,
	type VoiceBasedChannel,
} from 'discord.js';
import type { GuildQueue } from 'discord-player';
import { useQueue } from 'discord-player';
import { beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_MESSAGE_COMPONENT_AWAIT_TIME_MS } from '../../constants/miscellaneous';
import enqueuePlaylists from '../enqueuePlaylists';
import getEnvironmentVariable from '../getEnvironmentVariable';
import processTracksWithQueue from '../processTracksWithQueue';

const EXAMPLE_PLAYLIST_IDS = ['playlist1', 'playlist2'];
const EXAMPLE_PLAYLISTS_CHANNEL_ID = 'channel123';
const EXAMPLE_ENQUEUED_COUNT = 2;

function createMockCollection(
	messages: Message[],
): Collection<string, Message> {
	const collection = new Map(
		messages.map((msg, index) => [`msg${index}`, msg]),
	) as Collection<string, Message>;
	(
		collection as Collection<string, Message> & {
			filter: (predicate: (message: Message) => boolean) => Message[];
		}
	).filter = vi
		.fn()
		.mockImplementation((predicate: (message: Message) => boolean) => {
			return messages.filter(predicate);
		});
	return collection;
}

vi.mock('discord-player', () => ({
	useQueue: vi.fn(),
}));

vi.mock('../getEnvironmentVariable', () => ({
	default: vi.fn(),
}));

vi.mock('../processTracksWithQueue', () => ({
	default: vi.fn(),
}));

const mockedUseQueue = vi.mocked(useQueue);
const mockedGetEnvironmentVariable = vi.mocked(getEnvironmentVariable);
const mockedProcessTracksWithQueue = vi.mocked(processTracksWithQueue);

let mockInteraction: StringSelectMenuInteraction;
let mockVoiceChannel: VoiceBasedChannel;
let mockPlaylistsChannel: TextBasedChannel;
let mockResponse: Message;
let mockQueue: { tracks: { shuffle: () => void } } | null;

beforeEach(() => {
	vi.clearAllMocks();

	mockQueue = {
		tracks: {
			shuffle: vi.fn(),
		},
	};

	const mockMessage1 = {
		content: 'id="playlist1"\n```\nSong 1\nSong 2\n```',
	} as Message;
	const mockMessage2 = {
		content: 'id="playlist2"\n```\nSong 3\nSong 4\n```',
	} as Message;
	const mockMessages = createMockCollection([mockMessage1, mockMessage2]);

	mockPlaylistsChannel = {
		isTextBased: () => true,
		messages: {
			fetch: vi.fn().mockResolvedValue(mockMessages),
		},
	} as unknown as TextBasedChannel;

	mockResponse = {
		awaitMessageComponent: vi.fn(),
		edit: vi.fn(),
		delete: vi.fn(),
	} as unknown as Message;

	mockInteraction = {
		values: EXAMPLE_PLAYLIST_IDS,
		client: {
			channels: {
				cache: {
					get: vi.fn().mockReturnValue(mockPlaylistsChannel),
				},
			},
		},
		reply: vi.fn(),
		editReply: vi.fn().mockResolvedValue(mockResponse),
	} as unknown as StringSelectMenuInteraction;

	mockVoiceChannel = {} as VoiceBasedChannel;

	mockedGetEnvironmentVariable.mockReturnValue(EXAMPLE_PLAYLISTS_CHANNEL_ID);
	mockedProcessTracksWithQueue.mockResolvedValue({
		enqueued: EXAMPLE_ENQUEUED_COUNT,
	});
	mockedUseQueue.mockReturnValue(mockQueue as unknown as GuildQueue<unknown>);
});

it('should return early when playlists channel is not text-based', async () => {
	mockPlaylistsChannel = {
		isTextBased: () => false,
	} as unknown as TextBasedChannel;

	mockInteraction.client.channels.cache.get = vi
		.fn()
		.mockReturnValue(mockPlaylistsChannel);

	await enqueuePlaylists(mockInteraction, mockVoiceChannel);

	expect(mockInteraction.reply).toHaveBeenCalledWith({
		content: 'Invalid playlists channel type!',
		components: [],
	});
});

it('should fetch playlists channel using environment variable', async () => {
	await enqueuePlaylists(mockInteraction, mockVoiceChannel);

	expect(mockedGetEnvironmentVariable).toHaveBeenCalledWith(
		'PLAYLISTS_CHANNEL_ID',
	);
	expect(mockInteraction.client.channels.cache.get).toHaveBeenCalledWith(
		EXAMPLE_PLAYLISTS_CHANNEL_ID,
	);
});

it('should reply with processing embed initially', async () => {
	let replyCallArgs: unknown;
	(mockInteraction.reply as ReturnType<typeof vi.fn>).mockImplementationOnce(
		(args) => {
			replyCallArgs = args;
			return Promise.resolve();
		},
	);

	await enqueuePlaylists(mockInteraction, mockVoiceChannel);

	expect(mockInteraction.reply).toHaveBeenCalled();
	expect(replyCallArgs).toEqual({
		components: [],
		embeds: [expect.any(EmbedBuilder)],
	});
});

it('should fetch messages with correct parameters', async () => {
	await enqueuePlaylists(mockInteraction, mockVoiceChannel);

	expect(mockPlaylistsChannel.messages.fetch).toHaveBeenCalledWith({
		limit: 30,
		cache: false,
	});
});

it('should process tracks with correct parameters', async () => {
	await enqueuePlaylists(mockInteraction, mockVoiceChannel);

	expect(mockedProcessTracksWithQueue).toHaveBeenCalledWith({
		items: ['Song 1', 'Song 2', 'Song 3', 'Song 4'],
		voiceChannel: mockVoiceChannel,
		interaction: mockInteraction,
		embed: expect.any(EmbedBuilder),
		nodeMetadata: { queries: {} },
	});
});

it('should edit reply with completion message and shuffle button', async () => {
	await enqueuePlaylists(mockInteraction, mockVoiceChannel);

	expect(mockInteraction.editReply).toHaveBeenCalledWith({
		content: null,
		embeds: [
			expect.objectContaining({
				data: expect.objectContaining({
					title: '✅ Done',
					description: expect.stringContaining(
						'had been processed and added to the queue',
					),
				}),
			}),
		],
		components: [expect.any(ActionRowBuilder)],
	});
});

it('should shuffle queue when shuffle button is clicked', async () => {
	const mockButtonInteraction = {
		customId: 'shuffle',
	} as ButtonInteraction;

	(
		mockResponse.awaitMessageComponent as ReturnType<typeof vi.fn>
	).mockResolvedValue(mockButtonInteraction);

	await enqueuePlaylists(mockInteraction, mockVoiceChannel);

	expect(mockResponse.awaitMessageComponent).toHaveBeenCalledWith({
		time: DEFAULT_MESSAGE_COMPONENT_AWAIT_TIME_MS,
	});
	expect(mockQueue?.tracks.shuffle).toHaveBeenCalled();
	expect(mockResponse.edit).toHaveBeenCalledWith({ components: [] });
});

it('should handle button interaction timeout by deleting response', async () => {
	(
		mockResponse.awaitMessageComponent as ReturnType<typeof vi.fn>
	).mockRejectedValue(new Error('Timeout'));

	await enqueuePlaylists(mockInteraction, mockVoiceChannel);

	expect(mockResponse.delete).toHaveBeenCalled();
});

it('should handle missing queue gracefully', async () => {
	mockedUseQueue.mockReturnValue(null);

	const mockButtonInteraction = {
		customId: 'shuffle',
	} as ButtonInteraction;

	(
		mockResponse.awaitMessageComponent as ReturnType<typeof vi.fn>
	).mockResolvedValue(mockButtonInteraction);

	await enqueuePlaylists(mockInteraction, mockVoiceChannel);

	expect(mockResponse.edit).toHaveBeenCalledWith({ components: [] });
});

it('should ignore non-shuffle button interactions', async () => {
	const mockButtonInteraction = {
		customId: 'other',
	} as ButtonInteraction;

	(
		mockResponse.awaitMessageComponent as ReturnType<typeof vi.fn>
	).mockResolvedValue(mockButtonInteraction);

	await enqueuePlaylists(mockInteraction, mockVoiceChannel);

	expect(mockQueue?.tracks.shuffle).not.toHaveBeenCalled();
	expect(mockResponse.edit).toHaveBeenCalledWith({ components: [] });
});

it('should handle empty songs array correctly', async () => {
	const mockEmptyMessages = createMockCollection([]);
	mockPlaylistsChannel.messages.fetch = vi
		.fn()
		.mockResolvedValue(mockEmptyMessages);

	await enqueuePlaylists(mockInteraction, mockVoiceChannel);

	expect(mockedProcessTracksWithQueue).toHaveBeenCalledWith({
		items: [''],
		voiceChannel: mockVoiceChannel,
		interaction: mockInteraction,
		embed: expect.any(EmbedBuilder),
		nodeMetadata: { queries: {} },
	});
});

it('should handle playlist channel fetch failure', async () => {
	mockInteraction.client.channels.cache.get = vi.fn().mockReturnValue(null);

	await enqueuePlaylists(mockInteraction, mockVoiceChannel);

	expect(mockInteraction.reply).toHaveBeenCalledWith({
		content: 'Invalid playlists channel type!',
		components: [],
	});
});

it('should handle messages fetch failure gracefully', async () => {
	mockPlaylistsChannel.messages.fetch = vi
		.fn()
		.mockRejectedValue(new Error('Fetch failed'));

	await expect(
		enqueuePlaylists(mockInteraction, mockVoiceChannel),
	).rejects.toThrow('Fetch failed');
});

it('should process only messages that match playlist IDs', async () => {
	const mockMessage1 = {
		content: 'id="playlist1"\n```\nSong 1\nSong 2\n```',
	} as Message;
	const mockMessage2 = {
		content: 'id="playlist2"\n```\nSong 3\nSong 4\n```',
	} as Message;
	const mockMessage3 = {
		content: 'id="playlist3"\n```\nSong 5\nSong 6\n```',
	} as Message;

	const mockMessages = createMockCollection([
		mockMessage1,
		mockMessage2,
		mockMessage3,
	]);
	mockPlaylistsChannel.messages.fetch = vi.fn().mockResolvedValue(mockMessages);

	await enqueuePlaylists(mockInteraction, mockVoiceChannel);

	// Should only process songs from playlist1 and playlist2, not playlist3
	expect(mockedProcessTracksWithQueue).toHaveBeenCalledWith({
		items: ['Song 1', 'Song 2', 'Song 3', 'Song 4'],
		voiceChannel: mockVoiceChannel,
		interaction: mockInteraction,
		embed: expect.any(EmbedBuilder),
		nodeMetadata: { queries: {} },
	});
});
