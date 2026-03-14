import type { Tool } from 'ai';
import type {
	ChatInputCommandInteraction,
	VoiceBasedChannel,
} from 'discord.js';
import type { GuildQueue } from 'discord-player';
import { useMainPlayer } from 'discord-player';
import { beforeEach, expect, it, vi } from 'vitest';
import {
	formatToolArgs,
	generatePendingMessage,
	generateSuccessMessage,
	generateSystemPrompt,
	getAvailableTools,
	getToolMessages,
	isReadOnlyTool,
	type ToolContext,
} from '../promptTools';
import {
	deduplicateQueue,
	moveTracksByPattern,
	pausePlayback,
	removeTracksByPattern,
	resumePlayback,
	setVolume,
	skipCurrentTrack,
} from '../queueOperations';

vi.mock('../queueOperations', () => ({
	removeTracksByPattern: vi.fn().mockReturnValue({
		success: true,
		removedCount: 3,
	}),
	moveTracksByPattern: vi.fn().mockReturnValue({
		success: true,
		movedCount: 2,
	}),
	skipCurrentTrack: vi.fn().mockReturnValue({ success: true }),
	pausePlayback: vi.fn().mockReturnValue({ success: true, wasPaused: false }),
	resumePlayback: vi.fn().mockReturnValue({ success: true }),
	setVolume: vi.fn().mockReturnValue({ success: true, volume: 50 }),
	deduplicateQueue: vi.fn().mockReturnValue({
		success: true,
		removedCount: 1,
	}),
}));

vi.mock('discord-player', () => ({
	useMainPlayer: vi.fn(),
}));

vi.mock('../determineSearchEngine', () => ({
	default: vi.fn().mockReturnValue('youtubeSearch'),
}));

vi.mock('../getEnvironmentVariable', () => ({
	default: vi.fn().mockReturnValue('playlists-channel-id'),
}));

vi.mock('../StatsHandler', () => ({
	StatsHandler: {
		getInstance: vi.fn().mockReturnValue({
			saveStat: vi.fn(),
		}),
	},
}));

import cleanUpPlaylistContent from '../cleanUpPlaylistContent';

vi.mock('../cleanUpPlaylistContent', () => ({
	default: vi.fn().mockReturnValue('song one\nsong two'),
}));

const mockedCleanUpPlaylistContent = vi.mocked(cleanUpPlaylistContent);

const mockedUseMainPlayer = vi.mocked(useMainPlayer);

beforeEach(() => {
	vi.clearAllMocks();
});

const mockQueue = {
	node: { skip: vi.fn(), isPaused: vi.fn().mockReturnValue(false), volume: 50 },
	tracks: {
		toArray: vi.fn().mockReturnValue([]),
		size: 0,
	},
	currentTrack: null,
} as unknown as GuildQueue;

const mockInteraction = {} as ChatInputCommandInteraction;
const mockVoiceChannel = {} as VoiceBasedChannel;

const mockContext: ToolContext = {
	queue: mockQueue,
	currentTrackTitle: 'Test Song',
	currentTrackAuthor: 'Test Artist',
	trackCount: 5,
	interaction: mockInteraction,
	voiceChannel: mockVoiceChannel,
};

function executeTool(tool: Tool, input: Record<string, unknown>) {
	// biome-ignore lint/style/noNonNullAssertion: every tool in the registry defines execute
	return tool.execute!(input, {
		toolCallId: 'test',
		messages: [],
		abortSignal: AbortSignal.timeout(5000),
	});
}

it('should return all available tools including read and enqueue tools', () => {
	const tools = getAvailableTools(mockContext);

	expect(Object.keys(tools)).toEqual([
		'getQueueStatus',
		'listTracks',
		'removeTracksByPattern',
		'moveTracksByPattern',
		'skipCurrentTrack',
		'pausePlayback',
		'resumePlayback',
		'setVolume',
		'deduplicateQueue',
		'searchAndPlay',
		'listAvailablePlaylists',
		'enqueuePlaylist',
	]);
});

it('should exclude queue tools when queue is null', () => {
	const contextWithoutQueue: ToolContext = {
		...mockContext,
		queue: null,
	};

	const tools = getAvailableTools(contextWithoutQueue);

	expect(Object.keys(tools)).toEqual([
		'searchAndPlay',
		'listAvailablePlaylists',
		'enqueuePlaylist',
	]);
});

it('should return tool messages for known tools', () => {
	expect(getToolMessages('removeTracksByPattern')).toBeDefined();
	expect(getToolMessages('searchAndPlay')).toBeDefined();
	expect(getToolMessages('enqueuePlaylist')).toBeDefined();
	expect(getToolMessages('unknown')).toBeUndefined();
});

it('should identify read-only tools', () => {
	expect(isReadOnlyTool('getQueueStatus')).toBe(true);
	expect(isReadOnlyTool('listTracks')).toBe(true);
	expect(isReadOnlyTool('listAvailablePlaylists')).toBe(true);
	expect(isReadOnlyTool('removeTracksByPattern')).toBe(false);
	expect(isReadOnlyTool('searchAndPlay')).toBe(false);
	expect(isReadOnlyTool('enqueuePlaylist')).toBe(false);
	expect(isReadOnlyTool('unknownTool')).toBe(false);
});

it('should generate pending messages', () => {
	expect(generatePendingMessage('removeTracksByPattern')).toBe(
		'Removing tracks…',
	);
	expect(generatePendingMessage('skipCurrentTrack')).toBe('Skipping track…');
	expect(generatePendingMessage('searchAndPlay')).toBe(
		'Searching and adding to queue…',
	);
	expect(generatePendingMessage('enqueuePlaylist')).toBe(
		'Enqueueing playlist…',
	);
	expect(generatePendingMessage('getQueueStatus')).toBe(
		'Reading queue status…',
	);
	expect(generatePendingMessage('listTracks')).toBe('Listing tracks…');
	expect(generatePendingMessage('listAvailablePlaylists')).toBe(
		'Listing available playlists…',
	);
	expect(generatePendingMessage('unknownTool')).toBe('unknownTool…');
});

it('should generate success messages', () => {
	expect(
		generateSuccessMessage('removeTracksByPattern', { removedCount: 3 }),
	).toBe('Removed 3 tracks');

	expect(generateSuccessMessage('moveTracksByPattern', { movedCount: 1 })).toBe(
		'Moved 1 track to front',
	);

	expect(generateSuccessMessage('skipCurrentTrack', {})).toBe(
		'Skipped current track',
	);

	expect(generateSuccessMessage('pausePlayback', { wasPaused: true })).toBe(
		'Playback was already paused',
	);

	expect(generateSuccessMessage('pausePlayback', { wasPaused: false })).toBe(
		'Paused playback',
	);

	expect(generateSuccessMessage('resumePlayback', {})).toBe('Resumed playback');

	expect(generateSuccessMessage('setVolume', { volume: 75 })).toBe(
		'Set volume to 75',
	);

	expect(generateSuccessMessage('deduplicateQueue', { removedCount: 0 })).toBe(
		'No duplicates found',
	);

	expect(generateSuccessMessage('deduplicateQueue', { removedCount: 2 })).toBe(
		'Removed 2 duplicates',
	);

	expect(generateSuccessMessage('unknownTool', {})).toBe(
		'unknownTool completed',
	);

	expect(generateSuccessMessage('removeTracksByPattern', {})).toBe(
		'Removed 0 tracks',
	);

	expect(generateSuccessMessage('moveTracksByPattern', {})).toBe(
		'Moved 0 tracks to front',
	);

	expect(generateSuccessMessage('deduplicateQueue', {})).toBe(
		'No duplicates found',
	);
});

it('should generate success messages for searchAndPlay', () => {
	expect(
		generateSuccessMessage('searchAndPlay', {
			success: true,
			trackTitle: 'Bohemian Rhapsody',
			trackAuthor: 'Queen',
		}),
	).toBe('Added "Bohemian Rhapsody" by Queen');

	expect(
		generateSuccessMessage('searchAndPlay', {
			success: false,
			error: 'No results found for the query',
		}),
	).toBe('No results found for the query');
});

it('should generate success messages for enqueuePlaylist', () => {
	expect(
		generateSuccessMessage('enqueuePlaylist', {
			success: true,
			enqueuedCount: 10,
			totalCount: 10,
		}),
	).toBe('Enqueued 10 tracks from playlist');

	expect(
		generateSuccessMessage('enqueuePlaylist', {
			success: true,
			enqueuedCount: 8,
			totalCount: 10,
		}),
	).toBe('Enqueued 8/10 tracks from playlist');

	expect(
		generateSuccessMessage('enqueuePlaylist', {
			success: false,
			error: 'Playlist "unknown" not found',
		}),
	).toBe('Playlist "unknown" not found');
});

it('should generate system prompt with queue context', () => {
	const prompt = generateSystemPrompt(mockContext);

	expect(prompt).toContain('5 tracks');
	expect(prompt).toContain('"Test Song"');
	expect(prompt).toContain('Test Artist');
	expect(prompt).toContain('listTracks');
	expect(prompt).toContain('listAvailablePlaylists');
});

it('should generate system prompt for empty queue', () => {
	const emptyContext: ToolContext = {
		...mockContext,
		queue: null,
		trackCount: 0,
	};

	const prompt = generateSystemPrompt(emptyContext);

	expect(prompt).toContain('empty');
	expect(prompt).toContain('searchAndPlay');
	expect(prompt).toContain('enqueuePlaylist');
	expect(prompt).not.toContain('getQueueStatus');
});

it('should execute `removeTracksByPattern` tool', async () => {
	const tools = getAvailableTools(mockContext);
	const result = await executeTool(tools.removeTracksByPattern, {
		artistPattern: 'Artist',
		titlePattern: null,
	});

	expect(removeTracksByPattern).toHaveBeenCalledWith(
		mockQueue,
		'Artist',
		undefined,
	);
	expect(result).toEqual({ success: true, removedCount: 3 });
});

it('should execute `moveTracksByPattern` tool', async () => {
	const tools = getAvailableTools(mockContext);
	const result = await executeTool(tools.moveTracksByPattern, {
		artistPattern: 'Artist',
		titlePattern: null,
		position: 0,
	});

	expect(moveTracksByPattern).toHaveBeenCalledWith(
		mockQueue,
		'Artist',
		undefined,
		0,
	);
	expect(result).toEqual({ success: true, movedCount: 2 });
});

it('should execute `skipCurrentTrack` tool', async () => {
	const tools = getAvailableTools(mockContext);
	const result = await executeTool(tools.skipCurrentTrack, {});

	expect(skipCurrentTrack).toHaveBeenCalledWith(mockQueue);
	expect(result).toEqual({ success: true });
});

it('should execute `pausePlayback` tool', async () => {
	const tools = getAvailableTools(mockContext);
	const result = await executeTool(tools.pausePlayback, {});

	expect(pausePlayback).toHaveBeenCalledWith(mockQueue);
	expect(result).toEqual({ success: true, wasPaused: false });
});

it('should execute `resumePlayback` tool', async () => {
	const tools = getAvailableTools(mockContext);
	const result = await executeTool(tools.resumePlayback, {});

	expect(resumePlayback).toHaveBeenCalledWith(mockQueue);
	expect(result).toEqual({ success: true });
});

it('should execute `setVolume` tool', async () => {
	const tools = getAvailableTools(mockContext);
	const result = await executeTool(tools.setVolume, { volume: 50 });

	expect(setVolume).toHaveBeenCalledWith(mockQueue, 50);
	expect(result).toEqual({ success: true, volume: 50 });
});

it('should execute `deduplicateQueue` tool', async () => {
	const tools = getAvailableTools(mockContext);
	const result = await executeTool(tools.deduplicateQueue, {});

	expect(deduplicateQueue).toHaveBeenCalledWith(mockQueue);
	expect(result).toEqual({ success: true, removedCount: 1 });
});

it('should execute `getQueueStatus` tool', async () => {
	const tools = getAvailableTools(mockContext);
	const result = await executeTool(tools.getQueueStatus, {});

	expect(result).toEqual({
		success: true,
		currentTrack: null,
		trackCount: 0,
		isPaused: false,
		volume: 50,
	});
});

it('should execute `listTracks` tool with defaults', async () => {
	const tools = getAvailableTools(mockContext);
	const result = await executeTool(tools.listTracks, {});

	expect(result).toEqual({
		success: true,
		tracks: [],
		total: 0,
		hasMore: false,
	});
});

it('should format tool args with a single string value', () => {
	expect(formatToolArgs({ artistPattern: 'kendrick lamar' })).toBe(
		'artistPattern: "kendrick lamar"',
	);
});

it('should format tool args with multiple string values', () => {
	expect(
		formatToolArgs({ artistPattern: 'kendrick lamar', titlePattern: 'humble' }),
	).toBe('artistPattern: "kendrick lamar", titlePattern: "humble"');
});

it('should format tool args with a number value', () => {
	expect(formatToolArgs({ volume: 75 })).toBe('volume: 75');
});

it('should filter out nullish values from tool args', () => {
	expect(formatToolArgs({ artistPattern: null, titlePattern: 'test' })).toBe(
		'titlePattern: "test"',
	);
});

it('should return `undefined` for empty tool args', () => {
	expect(formatToolArgs({})).toBeUndefined();
});

it('should return queue status with current track info', async () => {
	const queueWithTrack = {
		...mockQueue,
		currentTrack: {
			title: 'Current Song',
			author: 'Current Artist',
			duration: '3:30',
		},
	} as unknown as GuildQueue;
	const contextWithTrack: ToolContext = {
		...mockContext,
		queue: queueWithTrack,
	};
	const tools = getAvailableTools(contextWithTrack);
	const result = await executeTool(tools.getQueueStatus, {});

	expect(result).toEqual({
		success: true,
		currentTrack: {
			title: 'Current Song',
			author: 'Current Artist',
			duration: '3:30',
		},
		trackCount: 0,
		isPaused: false,
		volume: 50,
	});
});

it('should list tracks with pagination', async () => {
	const tracks = [
		{ title: 'Song A', author: 'Artist A', duration: '3:00' },
		{ title: 'Song B', author: 'Artist B', duration: '4:00' },
		{ title: 'Song C', author: 'Artist C', duration: '5:00' },
	];
	const queueWithTracks = {
		...mockQueue,
		tracks: {
			toArray: vi.fn().mockReturnValue(tracks),
			size: 3,
		},
	} as unknown as GuildQueue;
	const contextWithTracks: ToolContext = {
		...mockContext,
		queue: queueWithTracks,
	};
	const tools = getAvailableTools(contextWithTracks);
	const result = await executeTool(tools.listTracks, {
		offset: 0,
		limit: 2,
	});

	expect(result).toEqual({
		success: true,
		tracks: [
			{ index: 0, title: 'Song A', author: 'Artist A', duration: '3:00' },
			{ index: 1, title: 'Song B', author: 'Artist B', duration: '4:00' },
		],
		total: 3,
		hasMore: true,
	});
});

it('should execute `searchAndPlay` tool successfully', async () => {
	const mockPlay = vi.fn().mockResolvedValue({
		track: { title: 'Found Song', author: 'Found Artist' },
	});
	mockedUseMainPlayer.mockReturnValue({
		play: mockPlay,
	} as unknown as ReturnType<typeof useMainPlayer>);

	const tools = getAvailableTools(mockContext);
	const result = await executeTool(tools.searchAndPlay, {
		query: 'test query',
	});

	expect(result).toEqual({
		success: true,
		trackTitle: 'Found Song',
		trackAuthor: 'Found Artist',
	});
	expect(mockPlay).toHaveBeenCalledWith(
		mockVoiceChannel,
		'test query',
		expect.objectContaining({ searchEngine: 'youtubeSearch' }),
	);
});

it('should handle `searchAndPlay` failure', async () => {
	const mockPlay = vi.fn().mockRejectedValue(new Error('Not found'));
	mockedUseMainPlayer.mockReturnValue({
		play: mockPlay,
	} as unknown as ReturnType<typeof useMainPlayer>);

	const tools = getAvailableTools(mockContext);
	const result = await executeTool(tools.searchAndPlay, {
		query: 'nonexistent',
	});

	expect(result).toEqual({
		success: false,
		error: 'No results found for the query',
	});
});

it('should list available playlists', async () => {
	const messages = [
		{ content: 'id="rock"\n```\nsong1\n```' },
		{ content: 'id="jazz"\n```\nsong2\n```' },
		{ content: 'no playlist here' },
	];

	const mockFetchResult = {
		map: vi
			.fn()
			.mockImplementation(
				(fn: (message: { content: string }) => string | undefined) =>
					messages.map(fn),
			),
	};

	const mockChannel = {
		isTextBased: () => true,
		messages: {
			fetch: vi.fn().mockResolvedValue(mockFetchResult),
		},
	};

	const contextWithChannel: ToolContext = {
		...mockContext,
		queue: null,
		interaction: {
			client: {
				channels: {
					cache: { get: vi.fn().mockReturnValue(mockChannel) },
				},
			},
			user: { id: '123' },
		} as unknown as ChatInputCommandInteraction,
	};

	const tools = getAvailableTools(contextWithChannel);
	const result = await executeTool(tools.listAvailablePlaylists, {});

	expect(result).toEqual({
		success: true,
		playlists: ['jazz', 'rock'],
	});
});

it('should handle error in `listAvailablePlaylists`', async () => {
	const mockChannel = {
		isTextBased: () => true,
		messages: {
			fetch: vi.fn().mockRejectedValue(new Error('Fetch failed')),
		},
	};

	const contextWithChannel: ToolContext = {
		...mockContext,
		queue: null,
		interaction: {
			client: {
				channels: {
					cache: { get: vi.fn().mockReturnValue(mockChannel) },
				},
			},
		} as unknown as ChatInputCommandInteraction,
	};

	const tools = getAvailableTools(contextWithChannel);
	const result = await executeTool(tools.listAvailablePlaylists, {});

	expect(result).toEqual({
		success: false,
		playlists: [],
		error: 'Failed to fetch playlists',
	});
});

it('should handle missing playlists channel in `listAvailablePlaylists`', async () => {
	const contextWithNoChannel: ToolContext = {
		...mockContext,
		queue: null,
		interaction: {
			client: {
				channels: {
					cache: { get: vi.fn().mockReturnValue(null) },
				},
			},
		} as unknown as ChatInputCommandInteraction,
	};

	const tools = getAvailableTools(contextWithNoChannel);
	const result = await executeTool(tools.listAvailablePlaylists, {});

	expect(result).toEqual({
		success: false,
		playlists: [],
		error: 'Playlists channel not found',
	});
});

it('should handle missing playlists channel in `enqueuePlaylist`', async () => {
	const contextWithNoChannel: ToolContext = {
		...mockContext,
		queue: null,
		interaction: {
			client: {
				channels: {
					cache: { get: vi.fn().mockReturnValue(null) },
				},
			},
		} as unknown as ChatInputCommandInteraction,
	};

	const tools = getAvailableTools(contextWithNoChannel);
	const result = await executeTool(tools.enqueuePlaylist, {
		playlistId: 'test',
	});

	expect(result).toEqual({
		success: false,
		enqueuedCount: 0,
		totalCount: 0,
		error: 'Playlists channel not found',
	});
});

it('should handle playlist not found in `enqueuePlaylist`', async () => {
	const mockChannel = {
		isTextBased: () => true,
		messages: {
			fetch: vi.fn().mockResolvedValue({
				find: vi.fn().mockReturnValue(undefined),
			}),
		},
	};

	const contextWithChannel: ToolContext = {
		...mockContext,
		queue: null,
		interaction: {
			client: {
				channels: {
					cache: { get: vi.fn().mockReturnValue(mockChannel) },
				},
			},
			user: { id: '123' },
		} as unknown as ChatInputCommandInteraction,
	};

	const tools = getAvailableTools(contextWithChannel);
	const result = await executeTool(tools.enqueuePlaylist, {
		playlistId: 'nonexistent',
	});

	expect(result).toEqual({
		success: false,
		enqueuedCount: 0,
		totalCount: 0,
		error: 'Playlist "nonexistent" not found',
	});
});

it('should enqueue playlist songs successfully', async () => {
	const mockPlay = vi.fn().mockResolvedValue({ track: {} });
	mockedUseMainPlayer.mockReturnValue({
		play: mockPlay,
	} as unknown as ReturnType<typeof useMainPlayer>);

	const mockChannel = {
		isTextBased: () => true,
		messages: {
			fetch: vi.fn().mockResolvedValue({
				find: vi.fn().mockReturnValue({
					content: 'id="myplaylist"\nsong one\nsong two',
				}),
			}),
		},
	};

	const contextWithChannel: ToolContext = {
		...mockContext,
		queue: null,
		interaction: {
			client: {
				channels: {
					cache: { get: vi.fn().mockReturnValue(mockChannel) },
				},
			},
			user: { id: '123' },
		} as unknown as ChatInputCommandInteraction,
	};

	const tools = getAvailableTools(contextWithChannel);
	const result = await executeTool(tools.enqueuePlaylist, {
		playlistId: 'myplaylist',
	});

	expect(result).toEqual({
		success: true,
		enqueuedCount: 2,
		totalCount: 2,
	});
	expect(mockPlay).toHaveBeenCalledTimes(2);
});

it('should handle empty playlist in `enqueuePlaylist`', async () => {
	mockedCleanUpPlaylistContent.mockReturnValueOnce('');

	const mockChannel = {
		isTextBased: () => true,
		messages: {
			fetch: vi.fn().mockResolvedValue({
				find: vi.fn().mockReturnValue({
					content: 'id="empty"',
				}),
			}),
		},
	};

	const contextWithChannel: ToolContext = {
		...mockContext,
		queue: null,
		interaction: {
			client: {
				channels: {
					cache: { get: vi.fn().mockReturnValue(mockChannel) },
				},
			},
			user: { id: '123' },
		} as unknown as ChatInputCommandInteraction,
	};

	const tools = getAvailableTools(contextWithChannel);
	const result = await executeTool(tools.enqueuePlaylist, {
		playlistId: 'empty',
	});

	expect(result).toEqual({
		success: false,
		enqueuedCount: 0,
		totalCount: 0,
		error: 'Playlist is empty',
	});
});

it('should handle partial enqueue failures in `enqueuePlaylist`', async () => {
	const mockPlay = vi
		.fn()
		.mockResolvedValueOnce({ track: {} })
		.mockRejectedValueOnce(new Error('Failed'));
	mockedUseMainPlayer.mockReturnValue({
		play: mockPlay,
	} as unknown as ReturnType<typeof useMainPlayer>);

	const mockChannel = {
		isTextBased: () => true,
		messages: {
			fetch: vi.fn().mockResolvedValue({
				find: vi.fn().mockReturnValue({
					content: 'id="partial"\nsong one\nsong two',
				}),
			}),
		},
	};

	const contextWithChannel: ToolContext = {
		...mockContext,
		queue: null,
		interaction: {
			client: {
				channels: {
					cache: { get: vi.fn().mockReturnValue(mockChannel) },
				},
			},
			user: { id: '123' },
		} as unknown as ChatInputCommandInteraction,
	};

	const tools = getAvailableTools(contextWithChannel);
	const result = await executeTool(tools.enqueuePlaylist, {
		playlistId: 'partial',
	});

	expect(result).toEqual({
		success: true,
		enqueuedCount: 1,
		totalCount: 2,
	});
});

it('should handle outer error in `enqueuePlaylist`', async () => {
	const mockChannel = {
		isTextBased: () => true,
		messages: {
			fetch: vi.fn().mockRejectedValue(new Error('Connection failed')),
		},
	};

	const contextWithChannel: ToolContext = {
		...mockContext,
		queue: null,
		interaction: {
			client: {
				channels: {
					cache: { get: vi.fn().mockReturnValue(mockChannel) },
				},
			},
		} as unknown as ChatInputCommandInteraction,
	};

	const tools = getAvailableTools(contextWithChannel);
	const result = await executeTool(tools.enqueuePlaylist, {
		playlistId: 'test',
	});

	expect(result).toEqual({
		success: false,
		enqueuedCount: 0,
		totalCount: 0,
		error: 'Failed to enqueue playlist',
	});
});
