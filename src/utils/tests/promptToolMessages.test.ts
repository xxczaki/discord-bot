import type { GuildQueue } from 'discord-player';
import { beforeEach, describe, expect, it } from 'vitest';
import {
	generatePendingMessage,
	generateSuccessMessage,
	generateSystemPrompt,
	getAvailableTools,
	getToolMessages,
	type ToolContext,
	type ToolResult,
} from '../promptTools';

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

		it('should return undefined for unknown tool', () => {
			const messages = getToolMessages('unknownTool');

			expect(messages).toBeUndefined();
		});
	});

	describe('getAvailableTools', () => {
		let mockContext: ToolContext;

		beforeEach(() => {
			mockContext = {
				queue: {} as GuildQueue,
				currentTrackTitle: 'Test Track',
				currentTrackAuthor: 'Test Artist',
				trackCount: 5,
			};
		});

		it('should return all available tools', () => {
			const tools = getAvailableTools(mockContext);

			expect(tools).toHaveProperty('removeTracksByPattern');
			expect(tools).toHaveProperty('moveTracksByPattern');
			expect(tools).toHaveProperty('skipCurrentTrack');
			expect(tools).toHaveProperty('pausePlayback');
			expect(tools).toHaveProperty('resumePlayback');
			expect(tools).toHaveProperty('setVolume');
			expect(tools).toHaveProperty('deduplicateQueue');
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
	});

	describe('generateSystemPrompt', () => {
		it('should include track count in prompt', () => {
			const context: ToolContext = {
				queue: {} as GuildQueue,
				currentTrackTitle: 'Test Track',
				currentTrackAuthor: 'Test Artist',
				trackCount: 10,
			};

			const prompt = generateSystemPrompt(context);

			expect(prompt).toContain('10 tracks');
		});

		it('should include current track information', () => {
			const context: ToolContext = {
				queue: {} as GuildQueue,
				currentTrackTitle: 'Never Gonna Give You Up',
				currentTrackAuthor: 'Rick Astley',
				trackCount: 5,
			};

			const prompt = generateSystemPrompt(context);

			expect(prompt).toContain('Never Gonna Give You Up');
			expect(prompt).toContain('Rick Astley');
		});

		it('should mention available actions', () => {
			const context: ToolContext = {
				queue: {} as GuildQueue,
				currentTrackTitle: 'Test',
				currentTrackAuthor: 'Artist',
				trackCount: 1,
			};

			const prompt = generateSystemPrompt(context);

			expect(prompt).toContain('Remove tracks');
			expect(prompt).toContain('Move tracks');
			expect(prompt).toContain('Skip the current track');
			expect(prompt).toContain('Pause playback');
			expect(prompt).toContain('Resume playback');
			expect(prompt).toContain('Set volume');
			expect(prompt).toContain('Remove duplicate tracks');
		});

		it('should emphasize queue-only functionality', () => {
			const context: ToolContext = {
				queue: {} as GuildQueue,
				currentTrackTitle: 'Test',
				currentTrackAuthor: 'Artist',
				trackCount: 1,
			};

			const prompt = generateSystemPrompt(context);

			expect(prompt).toContain('ONLY perform actions on the queue');
			expect(prompt).toContain('cannot answer general questions');
		});
	});

	describe('tool configuration', () => {
		let mockContext: ToolContext;

		beforeEach(() => {
			mockContext = {
				queue: {} as GuildQueue,
				currentTrackTitle: 'Test Track',
				currentTrackAuthor: 'Test Artist',
				trackCount: 5,
			};
		});

		it('should create tools with correct input schemas', () => {
			const tools = getAvailableTools(mockContext);

			expect(tools.removeTracksByPattern.inputSchema).toBeDefined();
			expect(tools.moveTracksByPattern.inputSchema).toBeDefined();
			expect(tools.skipCurrentTrack.inputSchema).toBeDefined();
			expect(tools.pausePlayback.inputSchema).toBeDefined();
			expect(tools.resumePlayback.inputSchema).toBeDefined();
			expect(tools.setVolume.inputSchema).toBeDefined();
			expect(tools.deduplicateQueue.inputSchema).toBeDefined();
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
				'After moving tracks to the front, use skipCurrentTrack to play them immediately',
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
