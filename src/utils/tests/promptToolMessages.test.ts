import type {
	ChatInputCommandInteraction,
	VoiceBasedChannel,
} from 'discord.js';
import type { GuildQueue } from 'discord-player';
import { beforeEach, describe, expect, it } from 'vitest';
import {
	generatePendingMessage,
	generateSuccessMessage,
	generateSystemPrompt,
	getAvailableTools,
	getToolMessages,
	isReadOnlyTool,
	type ToolContext,
	type ToolResult,
} from '../promptTools';

function createMockContext(overrides: Partial<ToolContext> = {}): ToolContext {
	return {
		queue: {} as GuildQueue,
		currentTrackTitle: 'Test Track',
		currentTrackAuthor: 'Test Artist',
		trackCount: 5,
		interaction: {} as ChatInputCommandInteraction,
		voiceChannel: {} as VoiceBasedChannel,
		...overrides,
	};
}

describe('promptToolMessages', () => {
	describe('generatePendingMessage', () => {
		it('should return pending message for moveTracksByPattern', () => {
			expect(generatePendingMessage('moveTracksByPattern')).toBe(
				'Moving tracks…',
			);
		});

		it('should return pending message for removeTracksByPattern', () => {
			expect(generatePendingMessage('removeTracksByPattern')).toBe(
				'Removing tracks…',
			);
		});

		it('should return pending message for skipCurrentTrack', () => {
			expect(generatePendingMessage('skipCurrentTrack')).toBe(
				'Skipping track…',
			);
		});

		it('should return pending message for pausePlayback', () => {
			expect(generatePendingMessage('pausePlayback')).toBe('Pausing playback…');
		});

		it('should return pending message for resumePlayback', () => {
			expect(generatePendingMessage('resumePlayback')).toBe(
				'Resuming playback…',
			);
		});

		it('should return pending message for setVolume', () => {
			expect(generatePendingMessage('setVolume')).toBe('Setting volume…');
		});

		it('should return pending message for deduplicateQueue', () => {
			expect(generatePendingMessage('deduplicateQueue')).toBe(
				'Removing duplicates…',
			);
		});

		it('should return pending message for searchAndPlay', () => {
			expect(generatePendingMessage('searchAndPlay')).toBe(
				'Searching and adding to queue…',
			);
		});

		it('should return pending message for enqueuePlaylist', () => {
			expect(generatePendingMessage('enqueuePlaylist')).toBe(
				'Enqueueing playlist…',
			);
		});

		it('should return pending message for getQueueStatus', () => {
			expect(generatePendingMessage('getQueueStatus')).toBe(
				'Reading queue status…',
			);
		});

		it('should return pending message for listTracks', () => {
			expect(generatePendingMessage('listTracks')).toBe('Listing tracks…');
		});

		it('should return pending message for listAvailablePlaylists', () => {
			expect(generatePendingMessage('listAvailablePlaylists')).toBe(
				'Listing available playlists…',
			);
		});

		it('should return default message for unknown tool', () => {
			expect(generatePendingMessage('unknownTool')).toBe('unknownTool…');
		});
	});

	describe('generateSuccessMessage - moveTracksByPattern', () => {
		it('should generate message for moving single track', () => {
			const result: ToolResult = {
				success: true,
				movedCount: 1,
			};

			expect(generateSuccessMessage('moveTracksByPattern', result)).toBe(
				'Moved 1 track to front',
			);
		});

		it('should generate message for moving multiple tracks', () => {
			const result: ToolResult = {
				success: true,
				movedCount: 5,
			};

			expect(generateSuccessMessage('moveTracksByPattern', result)).toBe(
				'Moved 5 tracks to front',
			);
		});

		it('should handle missing movedCount', () => {
			const result: ToolResult = {
				success: true,
			};

			expect(generateSuccessMessage('moveTracksByPattern', result)).toBe(
				'Moved 0 tracks to front',
			);
		});
	});

	describe('generateSuccessMessage - removeTracksByPattern', () => {
		it('should generate message for removing single track', () => {
			const result: ToolResult = {
				success: true,
				removedCount: 1,
			};

			expect(generateSuccessMessage('removeTracksByPattern', result)).toBe(
				'Removed 1 track',
			);
		});

		it('should generate message for removing multiple tracks', () => {
			const result: ToolResult = {
				success: true,
				removedCount: 7,
			};

			expect(generateSuccessMessage('removeTracksByPattern', result)).toBe(
				'Removed 7 tracks',
			);
		});

		it('should handle missing removedCount', () => {
			const result: ToolResult = {
				success: true,
			};

			expect(generateSuccessMessage('removeTracksByPattern', result)).toBe(
				'Removed 0 tracks',
			);
		});
	});

	describe('generateSuccessMessage - skipCurrentTrack', () => {
		it('should generate message for skipping track', () => {
			const result: ToolResult = {
				success: true,
			};

			expect(generateSuccessMessage('skipCurrentTrack', result)).toBe(
				'Skipped current track',
			);
		});
	});

	describe('generateSuccessMessage - pausePlayback', () => {
		it('should generate message for pausing playback', () => {
			const result: ToolResult = {
				success: true,
				wasPaused: false,
			};

			expect(generateSuccessMessage('pausePlayback', result)).toBe(
				'Paused playback',
			);
		});

		it('should generate message when already paused', () => {
			const result: ToolResult = {
				success: true,
				wasPaused: true,
			};

			expect(generateSuccessMessage('pausePlayback', result)).toBe(
				'Playback was already paused',
			);
		});
	});

	describe('generateSuccessMessage - resumePlayback', () => {
		it('should generate message for resuming playback', () => {
			const result: ToolResult = {
				success: true,
			};

			expect(generateSuccessMessage('resumePlayback', result)).toBe(
				'Resumed playback',
			);
		});
	});

	describe('generateSuccessMessage - setVolume', () => {
		it('should generate message with volume level', () => {
			const result: ToolResult = {
				success: true,
				volume: 50,
			};

			expect(generateSuccessMessage('setVolume', result)).toBe(
				'Set volume to 50',
			);
		});

		it('should handle minimum volume', () => {
			const result: ToolResult = {
				success: true,
				volume: 0,
			};

			expect(generateSuccessMessage('setVolume', result)).toBe(
				'Set volume to 0',
			);
		});

		it('should handle maximum volume', () => {
			const result: ToolResult = {
				success: true,
				volume: 100,
			};

			expect(generateSuccessMessage('setVolume', result)).toBe(
				'Set volume to 100',
			);
		});
	});

	describe('generateSuccessMessage - deduplicateQueue', () => {
		it('should generate message for no duplicates found', () => {
			const result: ToolResult = {
				success: true,
				removedCount: 0,
			};

			expect(generateSuccessMessage('deduplicateQueue', result)).toBe(
				'No duplicates found',
			);
		});

		it('should generate message for removing single duplicate', () => {
			const result: ToolResult = {
				success: true,
				removedCount: 1,
			};

			expect(generateSuccessMessage('deduplicateQueue', result)).toBe(
				'Removed 1 duplicate',
			);
		});

		it('should generate message for removing multiple duplicates', () => {
			const result: ToolResult = {
				success: true,
				removedCount: 5,
			};

			expect(generateSuccessMessage('deduplicateQueue', result)).toBe(
				'Removed 5 duplicates',
			);
		});
	});

	describe('generateSuccessMessage - searchAndPlay', () => {
		it('should generate message for successful search', () => {
			const result: ToolResult = {
				success: true,
				trackTitle: 'Bohemian Rhapsody',
				trackAuthor: 'Queen',
			};

			expect(generateSuccessMessage('searchAndPlay', result)).toBe(
				'Added "Bohemian Rhapsody" by Queen',
			);
		});

		it('should generate message for failed search', () => {
			const result: ToolResult = {
				success: false,
				error: 'No results found for the query',
			};

			expect(generateSuccessMessage('searchAndPlay', result)).toBe(
				'No results found for the query',
			);
		});
	});

	describe('generateSuccessMessage - enqueuePlaylist', () => {
		it('should generate message when all tracks enqueued', () => {
			const result: ToolResult = {
				success: true,
				enqueuedCount: 10,
				totalCount: 10,
			};

			expect(generateSuccessMessage('enqueuePlaylist', result)).toBe(
				'Enqueued 10 tracks from playlist',
			);
		});

		it('should generate message when some tracks failed', () => {
			const result: ToolResult = {
				success: true,
				enqueuedCount: 8,
				totalCount: 10,
			};

			expect(generateSuccessMessage('enqueuePlaylist', result)).toBe(
				'Enqueued 8/10 tracks from playlist',
			);
		});

		it('should generate message for single track', () => {
			const result: ToolResult = {
				success: true,
				enqueuedCount: 1,
				totalCount: 1,
			};

			expect(generateSuccessMessage('enqueuePlaylist', result)).toBe(
				'Enqueued 1 track from playlist',
			);
		});

		it('should generate message for playlist not found', () => {
			const result: ToolResult = {
				success: false,
				error: 'Playlist "unknown" not found',
			};

			expect(generateSuccessMessage('enqueuePlaylist', result)).toBe(
				'Playlist "unknown" not found',
			);
		});
	});

	describe('generateSuccessMessage - read-only tools', () => {
		it('should generate message for getQueueStatus', () => {
			expect(generateSuccessMessage('getQueueStatus', { success: true })).toBe(
				'Read queue status',
			);
		});

		it('should generate message for listTracks', () => {
			expect(generateSuccessMessage('listTracks', { success: true })).toBe(
				'Listed tracks',
			);
		});

		it('should generate message for listAvailablePlaylists', () => {
			expect(
				generateSuccessMessage('listAvailablePlaylists', { success: true }),
			).toBe('Listed available playlists');
		});
	});

	describe('generateSuccessMessage - unknown tool', () => {
		it('should return default success message', () => {
			const result: ToolResult = {
				success: true,
			};

			expect(generateSuccessMessage('unknownTool', result)).toBe(
				'unknownTool completed',
			);
		});
	});

	describe('getToolMessages', () => {
		it('should return messages for removeTracksByPattern', () => {
			const messages = getToolMessages('removeTracksByPattern');

			expect(messages).toBeDefined();
			expect(messages?.pending()).toBe('Removing tracks…');
		});

		it('should return messages for moveTracksByPattern', () => {
			const messages = getToolMessages('moveTracksByPattern');

			expect(messages).toBeDefined();
			expect(messages?.pending()).toBe('Moving tracks…');
		});

		it('should return messages for skipCurrentTrack', () => {
			const messages = getToolMessages('skipCurrentTrack');

			expect(messages).toBeDefined();
			expect(messages?.pending()).toBe('Skipping track…');
		});

		it('should return messages for pausePlayback', () => {
			const messages = getToolMessages('pausePlayback');

			expect(messages).toBeDefined();
			expect(messages?.pending()).toBe('Pausing playback…');
		});

		it('should return messages for resumePlayback', () => {
			const messages = getToolMessages('resumePlayback');

			expect(messages).toBeDefined();
			expect(messages?.pending()).toBe('Resuming playback…');
		});

		it('should return messages for setVolume', () => {
			const messages = getToolMessages('setVolume');

			expect(messages).toBeDefined();
			expect(messages?.pending()).toBe('Setting volume…');
		});

		it('should return messages for deduplicateQueue', () => {
			const messages = getToolMessages('deduplicateQueue');

			expect(messages).toBeDefined();
			expect(messages?.pending()).toBe('Removing duplicates…');
		});

		it('should return messages for searchAndPlay', () => {
			const messages = getToolMessages('searchAndPlay');

			expect(messages).toBeDefined();
			expect(messages?.pending()).toBe('Searching and adding to queue…');
		});

		it('should return messages for enqueuePlaylist', () => {
			const messages = getToolMessages('enqueuePlaylist');

			expect(messages).toBeDefined();
			expect(messages?.pending()).toBe('Enqueueing playlist…');
		});

		it('should return messages for getQueueStatus', () => {
			const messages = getToolMessages('getQueueStatus');

			expect(messages).toBeDefined();
			expect(messages?.pending()).toBe('Reading queue status…');
		});

		it('should return messages for listTracks', () => {
			const messages = getToolMessages('listTracks');

			expect(messages).toBeDefined();
			expect(messages?.pending()).toBe('Listing tracks…');
		});

		it('should return messages for listAvailablePlaylists', () => {
			const messages = getToolMessages('listAvailablePlaylists');

			expect(messages).toBeDefined();
			expect(messages?.pending()).toBe('Listing available playlists…');
		});

		it('should return undefined for unknown tool', () => {
			const messages = getToolMessages('unknownTool');

			expect(messages).toBeUndefined();
		});
	});

	describe('isReadOnlyTool', () => {
		it('should return true for read-only tools', () => {
			expect(isReadOnlyTool('getQueueStatus')).toBe(true);
			expect(isReadOnlyTool('listTracks')).toBe(true);
			expect(isReadOnlyTool('listAvailablePlaylists')).toBe(true);
		});

		it('should return false for action tools', () => {
			expect(isReadOnlyTool('removeTracksByPattern')).toBe(false);
			expect(isReadOnlyTool('moveTracksByPattern')).toBe(false);
			expect(isReadOnlyTool('skipCurrentTrack')).toBe(false);
			expect(isReadOnlyTool('pausePlayback')).toBe(false);
			expect(isReadOnlyTool('resumePlayback')).toBe(false);
			expect(isReadOnlyTool('setVolume')).toBe(false);
			expect(isReadOnlyTool('deduplicateQueue')).toBe(false);
			expect(isReadOnlyTool('searchAndPlay')).toBe(false);
			expect(isReadOnlyTool('enqueuePlaylist')).toBe(false);
		});

		it('should return false for unknown tools', () => {
			expect(isReadOnlyTool('unknownTool')).toBe(false);
		});
	});

	describe('getAvailableTools', () => {
		let mockContext: ToolContext;

		beforeEach(() => {
			mockContext = createMockContext();
		});

		it('should return all available tools when queue exists', () => {
			const tools = getAvailableTools(mockContext);

			expect(tools).toHaveProperty('getQueueStatus');
			expect(tools).toHaveProperty('listTracks');
			expect(tools).toHaveProperty('removeTracksByPattern');
			expect(tools).toHaveProperty('moveTracksByPattern');
			expect(tools).toHaveProperty('skipCurrentTrack');
			expect(tools).toHaveProperty('pausePlayback');
			expect(tools).toHaveProperty('resumePlayback');
			expect(tools).toHaveProperty('setVolume');
			expect(tools).toHaveProperty('deduplicateQueue');
			expect(tools).toHaveProperty('searchAndPlay');
			expect(tools).toHaveProperty('listAvailablePlaylists');
			expect(tools).toHaveProperty('enqueuePlaylist');
		});

		it('should only return non-queue tools when queue is null', () => {
			const tools = getAvailableTools(createMockContext({ queue: null }));

			expect(tools).not.toHaveProperty('getQueueStatus');
			expect(tools).not.toHaveProperty('listTracks');
			expect(tools).not.toHaveProperty('removeTracksByPattern');
			expect(tools).not.toHaveProperty('moveTracksByPattern');
			expect(tools).not.toHaveProperty('skipCurrentTrack');
			expect(tools).not.toHaveProperty('pausePlayback');
			expect(tools).not.toHaveProperty('resumePlayback');
			expect(tools).not.toHaveProperty('setVolume');
			expect(tools).not.toHaveProperty('deduplicateQueue');
			expect(tools).toHaveProperty('searchAndPlay');
			expect(tools).toHaveProperty('listAvailablePlaylists');
			expect(tools).toHaveProperty('enqueuePlaylist');
		});

		it('should return tools with correct schema for removeTracksByPattern', () => {
			const tools = getAvailableTools(mockContext);
			const tool = tools.removeTracksByPattern;

			expect(tool).toBeDefined();
			expect(tool.description).toContain('Remove all tracks');
		});

		it('should return tools with correct schema for moveTracksByPattern', () => {
			const tools = getAvailableTools(mockContext);
			const tool = tools.moveTracksByPattern;

			expect(tool).toBeDefined();
			expect(tool.description).toContain('Move all tracks');
		});

		it('should return tools with correct schema for skipCurrentTrack', () => {
			const tools = getAvailableTools(mockContext);
			const tool = tools.skipCurrentTrack;

			expect(tool).toBeDefined();
			expect(tool.description).toContain('Skip the currently playing track');
		});

		it('should return tools with correct schema for pausePlayback', () => {
			const tools = getAvailableTools(mockContext);
			const tool = tools.pausePlayback;

			expect(tool).toBeDefined();
			expect(tool.description).toBe('Pause the currently playing track');
		});

		it('should return tools with correct schema for resumePlayback', () => {
			const tools = getAvailableTools(mockContext);
			const tool = tools.resumePlayback;

			expect(tool).toBeDefined();
			expect(tool.description).toBe('Resume the paused track');
		});

		it('should return tools with correct schema for setVolume', () => {
			const tools = getAvailableTools(mockContext);
			const tool = tools.setVolume;

			expect(tool).toBeDefined();
			expect(tool.description).toContain('Set the playback volume');
		});

		it('should return tools with correct schema for deduplicateQueue', () => {
			const tools = getAvailableTools(mockContext);
			const tool = tools.deduplicateQueue;

			expect(tool).toBeDefined();
			expect(tool.description).toBe('Remove duplicate tracks from the queue');
		});

		it('should return tools with correct schema for searchAndPlay', () => {
			const tools = getAvailableTools(mockContext);
			const tool = tools.searchAndPlay;

			expect(tool).toBeDefined();
			expect(tool.description).toContain('Search for a song');
		});

		it('should return tools with correct schema for enqueuePlaylist', () => {
			const tools = getAvailableTools(mockContext);
			const tool = tools.enqueuePlaylist;

			expect(tool).toBeDefined();
			expect(tool.description).toContain('Enqueue all songs');
		});

		it('should return tools with correct schema for getQueueStatus', () => {
			const tools = getAvailableTools(mockContext);
			const tool = tools.getQueueStatus;

			expect(tool).toBeDefined();
			expect(tool.description).toContain('current queue status');
		});

		it('should return tools with correct schema for listTracks', () => {
			const tools = getAvailableTools(mockContext);
			const tool = tools.listTracks;

			expect(tool).toBeDefined();
			expect(tool.description).toContain('List tracks in the queue');
		});

		it('should return tools with correct schema for listAvailablePlaylists', () => {
			const tools = getAvailableTools(mockContext);
			const tool = tools.listAvailablePlaylists;

			expect(tool).toBeDefined();
			expect(tool.description).toContain('available internal playlists');
		});
	});

	describe('generateSystemPrompt', () => {
		it('should include track count in prompt', () => {
			const prompt = generateSystemPrompt(
				createMockContext({ trackCount: 10 }),
			);

			expect(prompt).toContain('10 tracks');
		});

		it('should include current track information', () => {
			const prompt = generateSystemPrompt(
				createMockContext({
					currentTrackTitle: 'Never Gonna Give You Up',
					currentTrackAuthor: 'Rick Astley',
				}),
			);

			expect(prompt).toContain('Never Gonna Give You Up');
			expect(prompt).toContain('Rick Astley');
		});

		it('should mention agentic read tools', () => {
			const prompt = generateSystemPrompt(createMockContext());

			expect(prompt).toContain('listTracks');
			expect(prompt).toContain('listAvailablePlaylists');
		});

		it('should describe empty queue state when queue is null', () => {
			const prompt = generateSystemPrompt(createMockContext({ queue: null }));

			expect(prompt).toContain('empty');
			expect(prompt).toContain('searchAndPlay');
			expect(prompt).toContain('enqueuePlaylist');
			expect(prompt).not.toContain('getQueueStatus');
		});

		it('should emphasize music-only functionality', () => {
			const prompt = generateSystemPrompt(createMockContext());

			expect(prompt).toContain('Stay strictly within this scope');
			expect(prompt).toContain('I can only help with the music queue');
		});
	});

	describe('tool configuration', () => {
		let mockContext: ToolContext;

		beforeEach(() => {
			mockContext = createMockContext();
		});

		it('should create tools with correct input schemas', () => {
			const tools = getAvailableTools(mockContext);

			expect(tools.getQueueStatus.inputSchema).toBeDefined();
			expect(tools.listTracks.inputSchema).toBeDefined();
			expect(tools.removeTracksByPattern.inputSchema).toBeDefined();
			expect(tools.moveTracksByPattern.inputSchema).toBeDefined();
			expect(tools.skipCurrentTrack.inputSchema).toBeDefined();
			expect(tools.pausePlayback.inputSchema).toBeDefined();
			expect(tools.resumePlayback.inputSchema).toBeDefined();
			expect(tools.setVolume.inputSchema).toBeDefined();
			expect(tools.deduplicateQueue.inputSchema).toBeDefined();
			expect(tools.searchAndPlay.inputSchema).toBeDefined();
			expect(tools.listAvailablePlaylists.inputSchema).toBeDefined();
			expect(tools.enqueuePlaylist.inputSchema).toBeDefined();
		});

		it('should create removeTracksByPattern tool with artist and title pattern parameters', () => {
			const tools = getAvailableTools(mockContext);
			const tool = tools.removeTracksByPattern;

			expect(tool.description).toBe(
				'Remove all tracks from the queue that match a pattern (artist name, title, or both)',
			);
		});

		it('should create moveTracksByPattern tool with position parameter', () => {
			const tools = getAvailableTools(mockContext);
			const tool = tools.moveTracksByPattern;

			expect(tool.description).toContain('Move all tracks matching a pattern');
			expect(tool.description).toContain(
				'Only moves tracks – does not skip or start playback',
			);
		});

		it('should create skipCurrentTrack tool with empty schema', () => {
			const tools = getAvailableTools(mockContext);
			const tool = tools.skipCurrentTrack;

			expect(tool.description).toBe(
				'Skip the currently playing track to play the next track in queue',
			);
		});
	});
});
