import {
	ActionRowBuilder,
	type ChatInputCommandInteraction,
	EmbedBuilder,
	type GuildMember,
	type Message,
	type TextBasedChannel,
	type VoiceBasedChannel,
} from 'discord.js';
import type { Track } from 'discord-player';
import { useQueue } from 'discord-player';
import { beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_MESSAGE_COMPONENT_AWAIT_TIME_MS } from '../../constants/miscellaneous';
import cleanUpPlaylistContent from '../cleanUpPlaylistContent';
import enqueuePlaylistSlice from '../enqueuePlaylistSlice';
import getEnvironmentVariable from '../getEnvironmentVariable';
import processTracksWithQueue from '../processTracksWithQueue';

vi.mock('discord-player', () => ({
	useQueue: vi.fn(),
}));

vi.mock('../cleanUpPlaylistContent');
vi.mock('../getEnvironmentVariable');
vi.mock('../processTracksWithQueue');

const mockStatsHandlerInstance = vi.hoisted(() => ({
	saveStat: vi.fn(),
}));

vi.mock('../StatsHandler', () => ({
	StatsHandler: {
		getInstance: vi.fn(() => mockStatsHandlerInstance),
	},
}));

const mockUseQueue = vi.mocked(useQueue);
const mockCleanUpPlaylistContent = vi.mocked(cleanUpPlaylistContent);
const mockGetEnvironmentVariable = vi.mocked(getEnvironmentVariable);
const mockProcessTracksWithQueue = vi.mocked(processTracksWithQueue);

beforeEach(() => {
	vi.clearAllMocks();
	mockGetEnvironmentVariable.mockReturnValue('playlists-channel-123');
	mockProcessTracksWithQueue.mockResolvedValue({ enqueued: 5 });
});

function createMockVoiceChannel(): VoiceBasedChannel {
	return {
		id: 'voice-channel-123',
		name: 'General',
	} as VoiceBasedChannel;
}

function createMockPlaylistsChannel(): TextBasedChannel {
	const mockMessages = [
		{
			content:
				'id="rock-classics"\n```\nBohemian Rhapsody\nSweet Child O Mine\nStairway to Heaven\nHotel California\nSmells Like Teen Spirit\n```',
		},
		{
			content:
				'id="pop-hits"\n```\nShape of You\nBlinding Lights\nWatermelon Sugar\nLevitating\n```',
		},
	];

	return {
		isTextBased: vi.fn().mockReturnValue(true),
		messages: {
			fetch: vi.fn().mockResolvedValue({
				find: vi.fn((predicate) => mockMessages.find(predicate)),
			}),
		},
	} as unknown as TextBasedChannel;
}

function createMockInteraction(
	playlistId = 'rock-classics',
	count = 3,
): ChatInputCommandInteraction {
	const mockResponse = {
		awaitMessageComponent: vi.fn().mockRejectedValue(new Error('timeout')),
		edit: vi.fn(),
		delete: vi.fn(),
	} as unknown as Message;

	return {
		user: {
			id: 'user-12345',
		},
		member: {
			voice: {
				channel: createMockVoiceChannel(),
			},
		} as GuildMember,
		client: {
			channels: {
				cache: {
					get: vi.fn().mockReturnValue(createMockPlaylistsChannel()),
				},
			},
		},
		options: {
			getString: vi.fn().mockReturnValue(playlistId),
			getInteger: vi.fn().mockReturnValue(count),
		},
		reply: vi.fn().mockResolvedValue(mockResponse),
		editReply: vi.fn().mockResolvedValue(mockResponse),
	} as unknown as ChatInputCommandInteraction;
}

function createMockTrack(id: string, title: string): Track {
	return {
		id,
		title,
		url: `https://example.com/${id}`,
	} as Track;
}

function createMockQueue(
	initialTracks: Track[] = [],
): NonNullable<ReturnType<typeof useQueue>> {
	let store = [...initialTracks];

	const queue = {
		tracks: {
			get size() {
				return store.length;
			},
			get store() {
				return store;
			},
			set store(value: Track[]) {
				store = value;
			},
			toArray: () => [...store],
			shuffle: vi.fn(),
		},
	} as unknown as NonNullable<ReturnType<typeof useQueue>>;

	return queue;
}

it('should process head slice correctly with no slicing needed', async () => {
	const interaction = createMockInteraction('rock-classics', 5);
	const voiceChannel = createMockVoiceChannel();
	const mockQueue = createMockQueue();

	mockCleanUpPlaylistContent.mockReturnValue(
		'Bohemian Rhapsody\nSweet Child O Mine\nStairway to Heaven',
	);

	mockUseQueue.mockReturnValueOnce(mockQueue);
	mockProcessTracksWithQueue.mockImplementation(async () => {
		mockQueue.tracks.store = [
			createMockTrack('1', 'Bohemian Rhapsody'),
			createMockTrack('2', 'Sweet Child O Mine'),
			createMockTrack('3', 'Stairway to Heaven'),
		];
		return { enqueued: 3 };
	});
	mockUseQueue.mockReturnValueOnce(mockQueue);

	await enqueuePlaylistSlice(
		interaction,
		voiceChannel,
		'rock-classics',
		'head',
		5,
	);

	expect(mockProcessTracksWithQueue).toHaveBeenCalledWith({
		items: ['Bohemian Rhapsody', 'Sweet Child O Mine', 'Stairway to Heaven'],
		voiceChannel,
		interaction,
		embed: expect.any(EmbedBuilder),
		nodeMetadata: {
			queries: {
				'0': 'Bohemian Rhapsody',
				'1': 'Sweet Child O Mine',
				'2': 'Stairway to Heaven',
			},
		},
	});

	expect(mockQueue.tracks.store).toHaveLength(3);
});

it('should process tail slice and remove excess tracks', async () => {
	const interaction = createMockInteraction('rock-classics', 2);
	const voiceChannel = createMockVoiceChannel();
	const mockQueue = createMockQueue();

	mockCleanUpPlaylistContent.mockReturnValue(
		'Bohemian Rhapsody\nSweet Child O Mine\nStairway to Heaven\nHotel California\nSmells Like Teen Spirit',
	);

	mockUseQueue.mockReturnValueOnce(mockQueue);
	mockProcessTracksWithQueue.mockImplementation(async () => {
		mockQueue.tracks.store = [
			createMockTrack('1', 'Bohemian Rhapsody'),
			createMockTrack('2', 'Sweet Child O Mine'),
			createMockTrack('3', 'Stairway to Heaven'),
			createMockTrack('4', 'Hotel California'),
			createMockTrack('5', 'Smells Like Teen Spirit'),
		];
		return { enqueued: 5 };
	});
	mockUseQueue.mockReturnValueOnce(mockQueue);

	await enqueuePlaylistSlice(
		interaction,
		voiceChannel,
		'rock-classics',
		'tail',
		2,
	);

	expect(mockQueue.tracks.store).toHaveLength(2);
	expect(mockQueue.tracks.store[0].title).toBe('Hotel California');
	expect(mockQueue.tracks.store[1].title).toBe('Smells Like Teen Spirit');
});

it('should handle playlist not found', async () => {
	const interaction = createMockInteraction('nonexistent-playlist', 3);
	const voiceChannel = createMockVoiceChannel();

	const mockPlaylistsChannel = {
		isTextBased: vi.fn().mockReturnValue(true),
		messages: {
			fetch: vi.fn().mockResolvedValue({
				find: vi.fn().mockReturnValue(undefined),
			}),
		},
	} as unknown as TextBasedChannel;

	interaction.client.channels.cache.get = vi
		.fn()
		.mockReturnValue(mockPlaylistsChannel);

	await enqueuePlaylistSlice(
		interaction,
		voiceChannel,
		'nonexistent-playlist',
		'head',
		3,
	);

	expect(interaction.editReply).toHaveBeenCalledWith({
		content: 'Playlist "nonexistent-playlist" not found!',
		embeds: [],
		components: [],
	});
});

it('should handle empty playlist', async () => {
	const interaction = createMockInteraction('empty-playlist', 3);
	const voiceChannel = createMockVoiceChannel();

	const mockPlaylistsChannel = {
		isTextBased: vi.fn().mockReturnValue(true),
		messages: {
			fetch: vi.fn().mockResolvedValue({
				find: vi.fn().mockReturnValue({
					content: 'id="empty-playlist"\n```\n```',
				}),
			}),
		},
	} as unknown as TextBasedChannel;

	interaction.client.channels.cache.get = vi
		.fn()
		.mockReturnValue(mockPlaylistsChannel);

	mockCleanUpPlaylistContent.mockReturnValue('');

	await enqueuePlaylistSlice(
		interaction,
		voiceChannel,
		'empty-playlist',
		'head',
		3,
	);

	expect(interaction.editReply).toHaveBeenCalledWith({
		content: 'Playlist "empty-playlist" is empty!',
		embeds: [],
		components: [],
	});
});

it('should handle invalid playlists channel type', async () => {
	const interaction = createMockInteraction('rock-classics', 3);
	const voiceChannel = createMockVoiceChannel();

	const mockInvalidChannel = {
		isTextBased: vi.fn().mockReturnValue(false),
	};

	interaction.client.channels.cache.get = vi
		.fn()
		.mockReturnValue(mockInvalidChannel);

	await enqueuePlaylistSlice(
		interaction,
		voiceChannel,
		'rock-classics',
		'head',
		3,
	);

	expect(interaction.reply).toHaveBeenCalledWith({
		content: 'Invalid playlists channel type!',
		components: [],
	});
});

it('should handle missing playlists channel', async () => {
	const interaction = createMockInteraction('rock-classics', 3);
	const voiceChannel = createMockVoiceChannel();

	interaction.client.channels.cache.get = vi.fn().mockReturnValue(null);

	await enqueuePlaylistSlice(
		interaction,
		voiceChannel,
		'rock-classics',
		'head',
		3,
	);

	expect(interaction.reply).toHaveBeenCalledWith({
		content: 'Invalid playlists channel type!',
		components: [],
	});
});

it('should handle count larger than playlist size for head', async () => {
	const interaction = createMockInteraction('small-playlist', 10);
	const voiceChannel = createMockVoiceChannel();
	const mockQueue = createMockQueue();

	const mockPlaylistsChannel = {
		isTextBased: vi.fn().mockReturnValue(true),
		messages: {
			fetch: vi.fn().mockResolvedValue({
				find: vi.fn().mockReturnValue({
					content: 'id="small-playlist"\n```\nSong 1\nSong 2\nSong 3\n```',
				}),
			}),
		},
	} as unknown as TextBasedChannel;

	interaction.client.channels.cache.get = vi
		.fn()
		.mockReturnValue(mockPlaylistsChannel);

	mockCleanUpPlaylistContent.mockReturnValue('Song 1\nSong 2\nSong 3');
	mockUseQueue.mockReturnValue(mockQueue);

	await enqueuePlaylistSlice(
		interaction,
		voiceChannel,
		'small-playlist',
		'head',
		10,
	);

	expect(mockProcessTracksWithQueue).toHaveBeenCalledWith({
		items: ['Song 1', 'Song 2', 'Song 3'],
		voiceChannel,
		interaction,
		embed: expect.any(EmbedBuilder),
		nodeMetadata: {
			queries: {
				'0': 'Song 1',
				'1': 'Song 2',
				'2': 'Song 3',
			},
		},
	});
});

it('should handle count larger than playlist size for tail', async () => {
	const interaction = createMockInteraction('small-playlist', 10);
	const voiceChannel = createMockVoiceChannel();
	const mockQueue = createMockQueue();

	const mockPlaylistsChannel = {
		isTextBased: vi.fn().mockReturnValue(true),
		messages: {
			fetch: vi.fn().mockResolvedValue({
				find: vi.fn().mockReturnValue({
					content: 'id="small-playlist"\n```\nSong 1\nSong 2\nSong 3\n```',
				}),
			}),
		},
	} as unknown as TextBasedChannel;

	interaction.client.channels.cache.get = vi
		.fn()
		.mockReturnValue(mockPlaylistsChannel);

	mockCleanUpPlaylistContent.mockReturnValue('Song 1\nSong 2\nSong 3');
	mockUseQueue.mockReturnValue(mockQueue);

	await enqueuePlaylistSlice(
		interaction,
		voiceChannel,
		'small-playlist',
		'tail',
		10,
	);

	expect(mockProcessTracksWithQueue).toHaveBeenCalledWith({
		items: ['Song 1', 'Song 2', 'Song 3'],
		voiceChannel,
		interaction,
		embed: expect.any(EmbedBuilder),
		nodeMetadata: {
			queries: {
				'0': 'Song 1',
				'1': 'Song 2',
				'2': 'Song 3',
			},
		},
	});
});

it('should handle shuffle button interaction', async () => {
	const interaction = createMockInteraction('rock-classics', 3);
	const voiceChannel = createMockVoiceChannel();
	const mockQueue = createMockQueue();

	mockCleanUpPlaylistContent.mockReturnValue(
		'Bohemian Rhapsody\nSweet Child O Mine\nStairway to Heaven',
	);
	mockUseQueue.mockReturnValue(mockQueue);

	const mockShuffleComponent = {
		customId: 'shuffle',
	};

	const mockResponse = {
		awaitMessageComponent: vi.fn().mockResolvedValue(mockShuffleComponent),
		edit: vi.fn(),
		delete: vi.fn(),
	} as unknown as Message;

	interaction.editReply = vi.fn().mockResolvedValue(mockResponse);

	await enqueuePlaylistSlice(
		interaction,
		voiceChannel,
		'rock-classics',
		'head',
		3,
	);

	expect(mockQueue.tracks.shuffle).toHaveBeenCalled();
	expect(mockResponse.edit).toHaveBeenCalledWith({ components: [] });
});

it('should handle component interaction timeout', async () => {
	const interaction = createMockInteraction('rock-classics', 3);
	const voiceChannel = createMockVoiceChannel();
	const mockQueue = createMockQueue();

	mockCleanUpPlaylistContent.mockReturnValue(
		'Bohemian Rhapsody\nSweet Child O Mine\nStairway to Heaven',
	);
	mockUseQueue.mockReturnValue(mockQueue);

	const mockResponse = {
		awaitMessageComponent: vi.fn().mockRejectedValue(new Error('timeout')),
		edit: vi.fn(),
		delete: vi.fn(),
	} as unknown as Message;

	interaction.editReply = vi.fn().mockResolvedValue(mockResponse);

	await enqueuePlaylistSlice(
		interaction,
		voiceChannel,
		'rock-classics',
		'head',
		3,
	);

	expect(mockResponse.delete).toHaveBeenCalled();
});

it('should use correct timeout for message component', async () => {
	const interaction = createMockInteraction('rock-classics', 3);
	const voiceChannel = createMockVoiceChannel();
	const mockQueue = createMockQueue();

	mockCleanUpPlaylistContent.mockReturnValue('Song 1\nSong 2\nSong 3');
	mockUseQueue.mockReturnValue(mockQueue);

	const mockResponse = {
		awaitMessageComponent: vi.fn().mockRejectedValue(new Error('timeout')),
		edit: vi.fn(),
		delete: vi.fn(),
	} as unknown as Message;

	interaction.editReply = vi.fn().mockResolvedValue(mockResponse);

	await enqueuePlaylistSlice(
		interaction,
		voiceChannel,
		'rock-classics',
		'head',
		3,
	);

	expect(mockResponse.awaitMessageComponent).toHaveBeenCalledWith({
		time: DEFAULT_MESSAGE_COMPONENT_AWAIT_TIME_MS,
	});
});

it('should display correct description for head operation with plural', async () => {
	const interaction = createMockInteraction('rock-classics', 3);
	const voiceChannel = createMockVoiceChannel();

	// Mock the channel to be valid but playlist not found (to stop after reply)
	const mockPlaylistsChannel = {
		isTextBased: vi.fn().mockReturnValue(true),
		messages: {
			fetch: vi.fn().mockResolvedValue({
				find: vi.fn().mockReturnValue(undefined), // Playlist not found
			}),
		},
	} as unknown as TextBasedChannel;

	interaction.client.channels.cache.get = vi
		.fn()
		.mockReturnValue(mockPlaylistsChannel);

	await enqueuePlaylistSlice(
		interaction,
		voiceChannel,
		'rock-classics',
		'head',
		3,
	);

	expect(interaction.reply).toHaveBeenCalledWith({
		components: [],
		embeds: [
			expect.objectContaining({
				data: expect.objectContaining({
					description: 'Fetching first 3 songs…',
				}),
			}),
		],
	});
});

it('should display correct description for head operation with singular', async () => {
	const interaction = createMockInteraction('rock-classics', 1);
	const voiceChannel = createMockVoiceChannel();

	const mockPlaylistsChannel = {
		isTextBased: vi.fn().mockReturnValue(true),
		messages: {
			fetch: vi.fn().mockResolvedValue({
				find: vi.fn().mockReturnValue(undefined),
			}),
		},
	} as unknown as TextBasedChannel;

	interaction.client.channels.cache.get = vi
		.fn()
		.mockReturnValue(mockPlaylistsChannel);

	await enqueuePlaylistSlice(
		interaction,
		voiceChannel,
		'rock-classics',
		'head',
		1,
	);

	expect(interaction.reply).toHaveBeenCalledWith({
		components: [],
		embeds: [
			expect.objectContaining({
				data: expect.objectContaining({
					description: 'Fetching first 1 song…',
				}),
			}),
		],
	});
});

it('should display correct description for tail operation with plural', async () => {
	const interaction = createMockInteraction('rock-classics', 3);
	const voiceChannel = createMockVoiceChannel();

	// Mock the channel to be valid but playlist not found (to stop after reply)
	const mockPlaylistsChannel = {
		isTextBased: vi.fn().mockReturnValue(true),
		messages: {
			fetch: vi.fn().mockResolvedValue({
				find: vi.fn().mockReturnValue(undefined), // Playlist not found
			}),
		},
	} as unknown as TextBasedChannel;

	interaction.client.channels.cache.get = vi
		.fn()
		.mockReturnValue(mockPlaylistsChannel);

	await enqueuePlaylistSlice(
		interaction,
		voiceChannel,
		'rock-classics',
		'tail',
		3,
	);

	expect(interaction.reply).toHaveBeenCalledWith({
		components: [],
		embeds: [
			expect.objectContaining({
				data: expect.objectContaining({
					description: 'Fetching last 3 songs…',
				}),
			}),
		],
	});
});

it('should display correct description for tail operation with singular', async () => {
	const interaction = createMockInteraction('rock-classics', 1);
	const voiceChannel = createMockVoiceChannel();

	const mockPlaylistsChannel = {
		isTextBased: vi.fn().mockReturnValue(true),
		messages: {
			fetch: vi.fn().mockResolvedValue({
				find: vi.fn().mockReturnValue(undefined),
			}),
		},
	} as unknown as TextBasedChannel;

	interaction.client.channels.cache.get = vi
		.fn()
		.mockReturnValue(mockPlaylistsChannel);

	await enqueuePlaylistSlice(
		interaction,
		voiceChannel,
		'rock-classics',
		'tail',
		1,
	);

	expect(interaction.reply).toHaveBeenCalledWith({
		components: [],
		embeds: [
			expect.objectContaining({
				data: expect.objectContaining({
					description: 'Fetching last 1 song…',
				}),
			}),
		],
	});
});

it('should filter out empty lines from playlist content', async () => {
	const interaction = createMockInteraction('playlist-with-empty-lines', 5);
	const voiceChannel = createMockVoiceChannel();
	const mockQueue = createMockQueue();

	const mockPlaylistsChannel = {
		isTextBased: vi.fn().mockReturnValue(true),
		messages: {
			fetch: vi.fn().mockResolvedValue({
				find: vi.fn().mockReturnValue({
					content:
						'id="playlist-with-empty-lines"\n```\nSong 1\n\n\nSong 2\n   \nSong 3\n\n\n```',
				}),
			}),
		},
	} as unknown as TextBasedChannel;

	interaction.client.channels.cache.get = vi
		.fn()
		.mockReturnValue(mockPlaylistsChannel);

	mockCleanUpPlaylistContent.mockReturnValue(
		'Song 1\n\n\nSong 2\n   \nSong 3\n\n',
	);
	mockUseQueue.mockReturnValue(mockQueue);

	await enqueuePlaylistSlice(
		interaction,
		voiceChannel,
		'playlist-with-empty-lines',
		'head',
		5,
	);

	expect(mockProcessTracksWithQueue).toHaveBeenCalledWith({
		items: ['Song 1', 'Song 2', 'Song 3'],
		voiceChannel,
		interaction,
		embed: expect.any(EmbedBuilder),
		nodeMetadata: {
			queries: {
				'0': 'Song 1',
				'1': 'Song 2',
				'2': 'Song 3',
			},
		},
	});
});

it('should properly pluralize success message for single song', async () => {
	const interaction = createMockInteraction('single-song-playlist', 1);
	const voiceChannel = createMockVoiceChannel();
	const mockQueue = createMockQueue();

	const mockPlaylistsChannel = {
		isTextBased: vi.fn().mockReturnValue(true),
		messages: {
			fetch: vi.fn().mockResolvedValue({
				find: vi.fn().mockReturnValue({
					content: 'id="single-song-playlist"\n```\nOnly Song\n```',
				}),
			}),
		},
	} as unknown as TextBasedChannel;

	interaction.client.channels.cache.get = vi
		.fn()
		.mockReturnValue(mockPlaylistsChannel);

	mockCleanUpPlaylistContent.mockReturnValue('Only Song');
	mockUseQueue.mockReturnValueOnce(mockQueue);
	mockProcessTracksWithQueue.mockImplementation(async () => {
		mockQueue.tracks.store = [createMockTrack('1', 'Only Song')];
		return { enqueued: 1 };
	});
	mockUseQueue.mockReturnValueOnce(mockQueue);

	await enqueuePlaylistSlice(
		interaction,
		voiceChannel,
		'single-song-playlist',
		'head',
		1,
	);

	expect(interaction.editReply).toHaveBeenCalledWith({
		content: null,
		embeds: [
			expect.objectContaining({
				data: expect.objectContaining({
					description: 'Added 1 song from the playlist to the queue',
				}),
			}),
		],
		components: [expect.any(ActionRowBuilder)],
	});
});

it('should properly pluralize success message for multiple songs', async () => {
	const interaction = createMockInteraction('multi-song-playlist', 3);
	const voiceChannel = createMockVoiceChannel();
	const mockQueue = createMockQueue();

	const mockPlaylistsChannel = {
		isTextBased: vi.fn().mockReturnValue(true),
		messages: {
			fetch: vi.fn().mockResolvedValue({
				find: vi.fn().mockReturnValue({
					content:
						'id="multi-song-playlist"\n```\nSong 1\nSong 2\nSong 3\nSong 4\nSong 5\n```',
				}),
			}),
		},
	} as unknown as TextBasedChannel;

	interaction.client.channels.cache.get = vi
		.fn()
		.mockReturnValue(mockPlaylistsChannel);

	mockCleanUpPlaylistContent.mockReturnValue(
		'Song 1\nSong 2\nSong 3\nSong 4\nSong 5',
	);
	mockUseQueue.mockReturnValueOnce(mockQueue);
	mockProcessTracksWithQueue.mockImplementation(async () => {
		mockQueue.tracks.store = [
			createMockTrack('1', 'Song 1'),
			createMockTrack('2', 'Song 2'),
			createMockTrack('3', 'Song 3'),
			createMockTrack('4', 'Song 4'),
			createMockTrack('5', 'Song 5'),
		];
		return { enqueued: 5 };
	});
	mockUseQueue.mockReturnValueOnce(mockQueue);

	await enqueuePlaylistSlice(
		interaction,
		voiceChannel,
		'multi-song-playlist',
		'head',
		3,
	);

	expect(interaction.editReply).toHaveBeenCalledWith({
		content: null,
		embeds: [
			expect.objectContaining({
				data: expect.objectContaining({
					description: 'Added the first 3 songs from the playlist to the queue',
				}),
			}),
		],
		components: [expect.any(ActionRowBuilder)],
	});
});

it('should use simplified wording when processing all songs', async () => {
	const interaction = createMockInteraction('small-playlist', 3);
	const voiceChannel = createMockVoiceChannel();
	const mockQueue = createMockQueue();

	const mockPlaylistsChannel = {
		isTextBased: vi.fn().mockReturnValue(true),
		messages: {
			fetch: vi.fn().mockResolvedValue({
				find: vi.fn().mockReturnValue({
					content: 'id="small-playlist"\n```\nSong 1\nSong 2\nSong 3\n```',
				}),
			}),
		},
	} as unknown as TextBasedChannel;

	interaction.client.channels.cache.get = vi
		.fn()
		.mockReturnValue(mockPlaylistsChannel);

	mockCleanUpPlaylistContent.mockReturnValue('Song 1\nSong 2\nSong 3');
	mockUseQueue.mockReturnValueOnce(mockQueue);
	mockProcessTracksWithQueue.mockImplementation(async () => {
		mockQueue.tracks.store = [
			createMockTrack('1', 'Song 1'),
			createMockTrack('2', 'Song 2'),
			createMockTrack('3', 'Song 3'),
		];
		return { enqueued: 3 };
	});
	mockUseQueue.mockReturnValueOnce(mockQueue);

	await enqueuePlaylistSlice(
		interaction,
		voiceChannel,
		'small-playlist',
		'head',
		3,
	);

	expect(interaction.editReply).toHaveBeenCalledWith({
		content: null,
		embeds: [
			expect.objectContaining({
				data: expect.objectContaining({
					description: 'Added 3 songs from the playlist to the queue',
				}),
			}),
		],
		components: [expect.any(ActionRowBuilder)],
	});
});
