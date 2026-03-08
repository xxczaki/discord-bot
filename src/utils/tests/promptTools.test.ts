import type { Tool } from 'ai';
import type {
	ChatInputCommandInteraction,
	VoiceBasedChannel,
} from 'discord.js';
import type { GuildQueue } from 'discord-player';
import { expect, it, vi } from 'vitest';
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
