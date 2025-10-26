import type { GuildQueue } from 'discord-player';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import logger from '../logger';
import {
	executeMoveTracksByPattern,
	executeRemoveTracksByPattern,
	executeSkipCurrentTrack,
	generateErrorMessage,
	generatePendingMessage,
	generateSuccessMessage,
	generateSystemPrompt,
	getAvailableTools,
	getToolMessages,
	type ToolContext,
	type ToolResult,
} from '../promptTools';
import * as queueOperations from '../queueOperations';

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

	describe('generateErrorMessage', () => {
		it('should extract error message from result', () => {
			const result: ToolResult = {
				success: false,
				error: 'No tracks found matching the criteria',
			};

			expect(generateErrorMessage('removeTracksByPattern', result)).toBe(
				'Failed: No tracks found matching the criteria',
			);
		});

		it('should return default error message when no error field', () => {
			const result: ToolResult = {
				success: false,
			};

			expect(generateErrorMessage('removeTracksByPattern', result)).toBe(
				'Operation failed',
			);
		});

		it('should return default for unknown tool', () => {
			const result: ToolResult = {
				success: false,
			};

			expect(generateErrorMessage('unknownTool', result)).toBe(
				'Operation failed',
			);
		});

		it('should handle result with error message', () => {
			const result: ToolResult = {
				success: false,
				error: 'Custom error message',
			};

			expect(generateErrorMessage('moveTracksByPattern', result)).toBe(
				'Failed: Custom error message',
			);
		});

		it('should handle result without success field', () => {
			const result: ToolResult = {
				error: 'Error occurred',
			};

			expect(generateErrorMessage('skipCurrentTrack', result)).toBe(
				'Failed: Error occurred',
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

	describe('executor functions', () => {
		let mockQueue: GuildQueue;

		beforeEach(() => {
			mockQueue = {} as GuildQueue;
			vi.clearAllMocks();
		});

		describe('executeRemoveTracksByPattern', () => {
			it('should successfully remove tracks with artist pattern', () => {
				const mockResult = {
					success: true,
					removedCount: 3,
					removedFromQueue: 3,
					skippedCurrent: false,
				};
				vi.spyOn(queueOperations, 'removeTracksByPattern').mockReturnValue(
					mockResult,
				);

				const result = executeRemoveTracksByPattern(
					mockQueue,
					'Test Artist',
					null,
				);

				expect(queueOperations.removeTracksByPattern).toHaveBeenCalledWith(
					mockQueue,
					'Test Artist',
					undefined,
				);
				expect(result).toEqual(mockResult);
			});

			it('should successfully remove tracks with title pattern', () => {
				const mockResult = {
					success: true,
					removedCount: 2,
					removedFromQueue: 2,
					skippedCurrent: false,
				};
				vi.spyOn(queueOperations, 'removeTracksByPattern').mockReturnValue(
					mockResult,
				);

				const result = executeRemoveTracksByPattern(
					mockQueue,
					null,
					'Test Song',
				);

				expect(queueOperations.removeTracksByPattern).toHaveBeenCalledWith(
					mockQueue,
					undefined,
					'Test Song',
				);
				expect(result).toEqual(mockResult);
			});

			it('should successfully remove tracks with both patterns', () => {
				const mockResult = {
					success: true,
					removedCount: 1,
					removedFromQueue: 1,
					skippedCurrent: false,
				};
				vi.spyOn(queueOperations, 'removeTracksByPattern').mockReturnValue(
					mockResult,
				);

				const result = executeRemoveTracksByPattern(
					mockQueue,
					'Artist',
					'Title',
				);

				expect(queueOperations.removeTracksByPattern).toHaveBeenCalledWith(
					mockQueue,
					'Artist',
					'Title',
				);
				expect(result).toEqual(mockResult);
			});

			it('should handle undefined patterns', () => {
				const mockResult = {
					success: true,
					removedCount: 0,
					removedFromQueue: 0,
					skippedCurrent: false,
				};
				vi.spyOn(queueOperations, 'removeTracksByPattern').mockReturnValue(
					mockResult,
				);

				const result = executeRemoveTracksByPattern(mockQueue, undefined, null);

				expect(queueOperations.removeTracksByPattern).toHaveBeenCalledWith(
					mockQueue,
					undefined,
					undefined,
				);
				expect(result).toEqual(mockResult);
			});

			it('should handle errors and log them with Error instance', () => {
				const error = new Error('Queue operation failed');
				vi.spyOn(queueOperations, 'removeTracksByPattern').mockImplementation(
					() => {
						throw error;
					},
				);
				vi.spyOn(logger, 'error').mockImplementation(() => {});

				expect(() =>
					executeRemoveTracksByPattern(mockQueue, 'Artist', 'Title'),
				).toThrow('Queue operation failed');

				expect(logger.error).toHaveBeenCalledWith(
					{
						error: 'Queue operation failed',
						artistPattern: 'Artist',
						titlePattern: 'Title',
					},
					'[PromptTool] removeTracksByPattern failed',
				);
			});

			it('should handle non-Error exceptions', () => {
				vi.spyOn(queueOperations, 'removeTracksByPattern').mockImplementation(
					() => {
						throw 'string error';
					},
				);
				vi.spyOn(logger, 'error').mockImplementation(() => {});

				expect(() =>
					executeRemoveTracksByPattern(mockQueue, 'Artist', null),
				).toThrow('string error');

				expect(logger.error).toHaveBeenCalledWith(
					{
						error: 'string error',
						artistPattern: 'Artist',
						titlePattern: null,
					},
					'[PromptTool] removeTracksByPattern failed',
				);
			});

			it('should handle object exceptions', () => {
				const errorObj = { message: 'custom error', code: 123 };
				vi.spyOn(queueOperations, 'removeTracksByPattern').mockImplementation(
					() => {
						throw errorObj;
					},
				);
				vi.spyOn(logger, 'error').mockImplementation(() => {});

				expect(() =>
					executeRemoveTracksByPattern(mockQueue, null, 'Title'),
				).toThrow();

				expect(logger.error).toHaveBeenCalledWith(
					{
						error: '[object Object]',
						artistPattern: null,
						titlePattern: 'Title',
					},
					'[PromptTool] removeTracksByPattern failed',
				);
			});
		});

		describe('executeMoveTracksByPattern', () => {
			it('should successfully move tracks to front', () => {
				const mockResult = { success: true, movedCount: 4 };
				vi.spyOn(queueOperations, 'moveTracksByPattern').mockReturnValue(
					mockResult,
				);

				const result = executeMoveTracksByPattern(mockQueue, 'Artist', null, 0);

				expect(queueOperations.moveTracksByPattern).toHaveBeenCalledWith(
					mockQueue,
					'Artist',
					undefined,
					0,
				);
				expect(result).toEqual(mockResult);
			});

			it('should successfully move tracks to end', () => {
				const mockResult = { success: true, movedCount: 2 };
				vi.spyOn(queueOperations, 'moveTracksByPattern').mockReturnValue(
					mockResult,
				);

				const result = executeMoveTracksByPattern(mockQueue, null, 'Title', -1);

				expect(queueOperations.moveTracksByPattern).toHaveBeenCalledWith(
					mockQueue,
					undefined,
					'Title',
					-1,
				);
				expect(result).toEqual(mockResult);
			});

			it('should successfully move tracks to specific position', () => {
				const mockResult = { success: true, movedCount: 3 };
				vi.spyOn(queueOperations, 'moveTracksByPattern').mockReturnValue(
					mockResult,
				);

				const result = executeMoveTracksByPattern(
					mockQueue,
					'Artist',
					'Song',
					5,
				);

				expect(queueOperations.moveTracksByPattern).toHaveBeenCalledWith(
					mockQueue,
					'Artist',
					'Song',
					5,
				);
				expect(result).toEqual(mockResult);
			});

			it('should handle undefined patterns', () => {
				const mockResult = { success: true, movedCount: 1 };
				vi.spyOn(queueOperations, 'moveTracksByPattern').mockReturnValue(
					mockResult,
				);

				const result = executeMoveTracksByPattern(
					mockQueue,
					undefined,
					undefined,
					0,
				);

				expect(queueOperations.moveTracksByPattern).toHaveBeenCalledWith(
					mockQueue,
					undefined,
					undefined,
					0,
				);
				expect(result).toEqual(mockResult);
			});

			it('should handle errors and log them with Error instance', () => {
				const error = new Error('Move operation failed');
				vi.spyOn(queueOperations, 'moveTracksByPattern').mockImplementation(
					() => {
						throw error;
					},
				);
				vi.spyOn(logger, 'error').mockImplementation(() => {});

				expect(() =>
					executeMoveTracksByPattern(mockQueue, 'Artist', 'Title', 0),
				).toThrow('Move operation failed');

				expect(logger.error).toHaveBeenCalledWith(
					{
						error: 'Move operation failed',
						artistPattern: 'Artist',
						titlePattern: 'Title',
						position: 0,
					},
					'[PromptTool] moveTracksByPattern failed',
				);
			});

			it('should handle non-Error exceptions', () => {
				vi.spyOn(queueOperations, 'moveTracksByPattern').mockImplementation(
					() => {
						throw 42;
					},
				);
				vi.spyOn(logger, 'error').mockImplementation(() => {});

				expect(() =>
					executeMoveTracksByPattern(mockQueue, null, 'Song', 5),
				).toThrow();

				expect(logger.error).toHaveBeenCalledWith(
					{
						error: '42',
						artistPattern: null,
						titlePattern: 'Song',
						position: 5,
					},
					'[PromptTool] moveTracksByPattern failed',
				);
			});

			it('should handle object exceptions', () => {
				const errorObj = { custom: 'error' };
				vi.spyOn(queueOperations, 'moveTracksByPattern').mockImplementation(
					() => {
						throw errorObj;
					},
				);
				vi.spyOn(logger, 'error').mockImplementation(() => {});

				expect(() =>
					executeMoveTracksByPattern(mockQueue, 'Test', null, 0),
				).toThrow();

				expect(logger.error).toHaveBeenCalledWith(
					{
						error: '[object Object]',
						artistPattern: 'Test',
						titlePattern: null,
						position: 0,
					},
					'[PromptTool] moveTracksByPattern failed',
				);
			});
		});

		describe('executeSkipCurrentTrack', () => {
			it('should successfully skip current track', () => {
				const mockResult = { success: true };
				vi.spyOn(queueOperations, 'skipCurrentTrack').mockReturnValue(
					mockResult,
				);

				const result = executeSkipCurrentTrack(mockQueue);

				expect(queueOperations.skipCurrentTrack).toHaveBeenCalledWith(
					mockQueue,
				);
				expect(result).toEqual(mockResult);
			});

			it('should handle errors and log them with Error instance', () => {
				const error = new Error('Skip operation failed');
				vi.spyOn(queueOperations, 'skipCurrentTrack').mockImplementation(() => {
					throw error;
				});
				vi.spyOn(logger, 'error').mockImplementation(() => {});

				expect(() => executeSkipCurrentTrack(mockQueue)).toThrow(
					'Skip operation failed',
				);

				expect(logger.error).toHaveBeenCalledWith(
					{
						error: 'Skip operation failed',
					},
					'[PromptTool] skipCurrentTrack failed',
				);
			});

			it('should handle non-Error exceptions', () => {
				vi.spyOn(queueOperations, 'skipCurrentTrack').mockImplementation(() => {
					throw 'string error';
				});
				vi.spyOn(logger, 'error').mockImplementation(() => {});

				expect(() => executeSkipCurrentTrack(mockQueue)).toThrow(
					'string error',
				);

				expect(logger.error).toHaveBeenCalledWith(
					{
						error: 'string error',
					},
					'[PromptTool] skipCurrentTrack failed',
				);
			});

			it('should handle object exceptions', () => {
				const errorObj = { message: 'custom error' };
				vi.spyOn(queueOperations, 'skipCurrentTrack').mockImplementation(() => {
					throw errorObj;
				});
				vi.spyOn(logger, 'error').mockImplementation(() => {});

				expect(() => executeSkipCurrentTrack(mockQueue)).toThrow();

				expect(logger.error).toHaveBeenCalledWith(
					{
						error: '[object Object]',
					},
					'[PromptTool] skipCurrentTrack failed',
				);
			});
		});
	});
});
