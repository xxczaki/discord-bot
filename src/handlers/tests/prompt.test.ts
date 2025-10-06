import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { GuildQueue, Track } from 'discord-player';
import { useQueue } from 'discord-player';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import promptCommandHandler from '../prompt';

const EXAMPLE_TRACK_TITLE = 'Like a Rolling Stone';
const EXAMPLE_TRACK_AUTHOR = 'Bob Dylan';

vi.mock('discord-player', () => ({
	useQueue: vi.fn(),
}));

vi.mock('ai', () => ({
	streamText: vi.fn(),
	tool: vi.fn((config) => config),
	stepCountIs: vi.fn((n) => ({ type: 'step-count', count: n })),
	NoSuchToolError: {
		isInstance: vi.fn(() => false),
	},
	InvalidArgumentError: {
		isInstance: vi.fn(() => false),
	},
}));

vi.mock('@ai-sdk/openai', () => ({
	openai: vi.fn(() => 'mock-model'),
}));

// Mock the RateLimiter to avoid interference between tests
const mockRateLimiter = vi.hoisted(() => ({
	canMakeCall: vi.fn().mockReturnValue(true),
	incrementCall: vi.fn(),
	getRemainingCalls: vi.fn().mockReturnValue(100),
	reset: vi.fn(),
}));

vi.mock('../../utils/RateLimiter', () => {
	return {
		RateLimiter: {
			getInstance: vi.fn(() => mockRateLimiter),
		},
	};
});

const mockedUseQueue = vi.mocked(useQueue);
const mockedStreamText = vi.mocked(streamText);
const mockedOpenai = vi.mocked(openai);

function createMockStream(
	toolCalls: Array<{
		toolName: string;
		input: Record<string, unknown>;
		output?: Record<string, unknown>;
	}> = [],
) {
	return {
		fullStream: (async function* () {
			for (const call of toolCalls) {
				const callId = `call-${Math.random()}`;

				// Yield tool call
				yield {
					type: 'tool-call' as const,
					toolName: call.toolName,
					toolCallId: callId,
					input: call.input,
				};

				// Yield tool result if output is provided
				if (call.output) {
					yield {
						type: 'tool-result' as const,
						toolCallId: callId,
						toolName: call.toolName,
						output: call.output,
					};
				}
			}
		})(),
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	process.env.OPENAI_API_KEY = 'test-api-key';

	mockRateLimiter.canMakeCall.mockReturnValue(true);
	mockRateLimiter.getRemainingCalls.mockReturnValue(100);
});

afterEach(() => {
	vi.clearAllMocks();
});

function createMockTrack(overrides: Partial<Track> = {}): Track {
	return {
		id: `track-${Date.now()}`,
		title: EXAMPLE_TRACK_TITLE,
		author: EXAMPLE_TRACK_AUTHOR,
		url: 'https://example.com/track',
		duration: '6:13',
		metadata: {},
		...overrides,
	} as Track;
}

function createMockInteraction(prompt: string): ChatInputCommandInteraction {
	return {
		options: {
			getString: vi.fn().mockReturnValue(prompt),
		},
		reply: vi.fn().mockResolvedValue({}),
		editReply: vi.fn().mockResolvedValue({}),
	} as unknown as ChatInputCommandInteraction;
}

function createMockQueue(
	tracks: Track[] = [],
	currentTrack?: Track,
): GuildQueue {
	return {
		tracks: {
			toArray: vi.fn().mockReturnValue(tracks),
		},
		currentTrack:
			currentTrack ??
			createMockTrack({ title: 'The Times They Are a-Changin' }),
		removeTrack: vi.fn(),
		moveTrack: vi.fn(),
		node: {
			skip: vi.fn(),
		},
	} as unknown as GuildQueue;
}

describe('/prompt command', () => {
	describe('validation and error handling', () => {
		it('should handle missing API key', async () => {
			delete process.env.OPENAI_API_KEY;
			const interaction = createMockInteraction('test');

			await promptCommandHandler(interaction);

			expect(interaction.reply).toHaveBeenCalledWith({
				content: 'The `/prompt` command is not available.',
				flags: ['Ephemeral'],
			});

			process.env.OPENAI_API_KEY = 'test-api-key';
		});

		it('should handle empty queue', async () => {
			const interaction = createMockInteraction('remove all bob dylan songs');
			mockedUseQueue.mockReturnValue(null);

			await promptCommandHandler(interaction);

			expect(interaction.reply).toHaveBeenCalledWith({
				content: 'The queue is empty. Cannot process prompt.',
				flags: ['Ephemeral'],
			});
		});

		it('should handle rate limit exceeded', async () => {
			const tracks = [createMockTrack()];
			const mockQueue = createMockQueue(tracks);
			const interaction = createMockInteraction('remove all songs');

			mockedUseQueue.mockReturnValue(mockQueue);

			mockRateLimiter.canMakeCall.mockReturnValue(false);

			await promptCommandHandler(interaction);

			expect(interaction.reply).toHaveBeenCalledWith({
				content:
					'Daily rate limit reached (100 calls per day). Try again tomorrow.',
				flags: ['Ephemeral'],
			});
		});

		it('should handle AI errors gracefully', async () => {
			const tracks = [createMockTrack()];
			const mockQueue = createMockQueue(tracks);
			const interaction = createMockInteraction('test');

			mockedUseQueue.mockReturnValue(mockQueue);
			mockedStreamText.mockReturnValue({
				fullStream: (async function* () {
					yield { type: 'text-delta' as const, textDelta: '' };
					throw new Error('AI service error');
				})(),
			} as never);

			await promptCommandHandler(interaction);

			expect(interaction.editReply).toHaveBeenCalledWith({
				content: 'AI service error',
			});
		});

		it('should handle unknown errors', async () => {
			const tracks = [createMockTrack()];
			const mockQueue = createMockQueue(tracks);
			const interaction = createMockInteraction('test');

			mockedUseQueue.mockReturnValue(mockQueue);
			mockedStreamText.mockReturnValue({
				fullStream: (async function* () {
					yield { type: 'text-delta' as const, textDelta: '' };
					throw 'Unknown error';
				})(),
			} as never);

			await promptCommandHandler(interaction);

			expect(interaction.editReply).toHaveBeenCalledWith({
				content: 'An error occurred while processing your request.',
			});
		});
	});

	describe('basic functionality', () => {
		it('should reply with initial processing message', async () => {
			const tracks = [
				createMockTrack(),
				createMockTrack({ title: 'Blowin in the Wind' }),
			];
			const mockQueue = createMockQueue(tracks);
			const interaction = createMockInteraction('show me the queue');

			mockedUseQueue.mockReturnValue(mockQueue);
			mockedStreamText.mockReturnValue(createMockStream() as never);

			await promptCommandHandler(interaction);

			expect(interaction.reply).toHaveBeenCalledWith('Analyzing queue…');
		});

		it('should increment rate limiter after successful call', async () => {
			const tracks = [createMockTrack()];
			const mockQueue = createMockQueue(tracks);
			const interaction = createMockInteraction('test');

			mockedUseQueue.mockReturnValue(mockQueue);
			mockedStreamText.mockReturnValue(createMockStream() as never);

			await promptCommandHandler(interaction);

			expect(mockRateLimiter.incrementCall).toHaveBeenCalled();
		});

		it('should display message when no actions performed', async () => {
			const tracks = [createMockTrack()];
			const mockQueue = createMockQueue(tracks);
			const interaction = createMockInteraction('test');

			mockedUseQueue.mockReturnValue(mockQueue);
			mockedStreamText.mockReturnValue(createMockStream() as never);

			await promptCommandHandler(interaction);

			expect(interaction.editReply).toHaveBeenCalledWith(
				expect.stringContaining('No actions were performed'),
			);
		});
	});

	describe('tool invocation', () => {
		it('should display user-friendly messages for remove operations', async () => {
			const tracks = [
				createMockTrack({ title: 'Song 1', author: 'Bob Dylan' }),
			];
			const mockQueue = createMockQueue(tracks);
			const interaction = createMockInteraction('remove bob dylan songs');

			mockedUseQueue.mockReturnValue(mockQueue);
			mockedStreamText.mockReturnValue(
				createMockStream([
					{
						toolName: 'removeTracksByPattern',
						input: {
							artistPattern: 'bob dylan',
						},
						output: {
							success: true,
							removedCount: 3,
						},
					},
				]) as never,
			);

			await promptCommandHandler(interaction);

			const lastCall = vi.mocked(interaction.editReply).mock.calls.at(-1);
			const output = lastCall?.[0] as string;
			expect(output).toContain('✅');
			expect(output).toContain('Removed 3 tracks');
		});

		it('should display user-friendly messages for move operations', async () => {
			const tracks = [createMockTrack({ title: 'Song 1', author: 'Artist 1' })];
			const mockQueue = createMockQueue(tracks);
			const interaction = createMockInteraction('move songs to front');

			mockedUseQueue.mockReturnValue(mockQueue);
			mockedStreamText.mockReturnValue(
				createMockStream([
					{
						toolName: 'moveTracksByPattern',
						input: {
							artistPattern: 'artist 1',
							position: 0,
						},
						output: {
							success: true,
							movedCount: 2,
						},
					},
				]) as never,
			);

			await promptCommandHandler(interaction);

			const lastCall = vi.mocked(interaction.editReply).mock.calls.at(-1);
			expect(lastCall?.[0]).toContain('✅');
			expect(lastCall?.[0]).toContain('Moved 2 tracks to front');
		});

		it('should display error messages clearly', async () => {
			const tracks = [createMockTrack()];
			const mockQueue = createMockQueue(tracks);
			const interaction = createMockInteraction('test');

			mockedUseQueue.mockReturnValue(mockQueue);
			mockedStreamText.mockReturnValue(
				createMockStream([
					{
						toolName: 'removeTracksByPattern',
						input: {
							artistPattern: 'test',
						},
						output: {
							success: false,
							error: 'No tracks found matching the criteria',
						},
					},
				]) as never,
			);

			await promptCommandHandler(interaction);

			const lastCall = vi.mocked(interaction.editReply).mock.calls.at(-1);
			const callArg = lastCall?.[0] as string;
			expect(callArg).toContain('❌');
			expect(callArg).toContain('Failed');
		});

		it('should display multiple operations in history format', async () => {
			const tracks = [createMockTrack({ title: 'Song 1', author: 'Artist 1' })];
			const mockQueue = createMockQueue(tracks);
			const interaction = createMockInteraction('move songs and skip');

			mockedUseQueue.mockReturnValue(mockQueue);
			mockedStreamText.mockReturnValue(
				createMockStream([
					{
						toolName: 'moveTracksByPattern',
						input: {
							artistPattern: 'artist 1',
							position: 0,
						},
						output: {
							success: true,
							movedCount: 1,
						},
					},
					{
						toolName: 'skipCurrentTrack',
						input: {},
						output: {
							success: true,
						},
					},
				]) as never,
			);

			await promptCommandHandler(interaction);

			const lastCall = vi.mocked(interaction.editReply).mock.calls.at(-1);
			const output = lastCall?.[0] as string;

			// Both actions should appear in the output
			expect(output).toContain('✅');
			expect(output).toContain('Moved 1 track');
			expect(output).toContain('Skipped current track');

			// They should appear on separate lines (history format)
			const lines = output.split('\n');
			expect(lines.length).toBeGreaterThanOrEqual(2);
		});
	});

	describe('AI integration', () => {
		it('should pass correct context to AI', async () => {
			const tracks = [
				createMockTrack({ title: 'Song 1', author: 'Artist 1' }),
				createMockTrack({ title: 'Song 2', author: 'Artist 2' }),
			];
			const currentTrack = createMockTrack({
				title: 'Current Song',
				author: 'Current Artist',
			});
			const mockQueue = createMockQueue(tracks, currentTrack);
			const interaction = createMockInteraction('test prompt');

			mockedUseQueue.mockReturnValue(mockQueue);
			mockedStreamText.mockReturnValue(createMockStream() as never);

			await promptCommandHandler(interaction);

			expect(mockedStreamText).toHaveBeenCalledWith(
				expect.objectContaining({
					prompt: expect.stringContaining('test prompt'),
				}),
			);

			const [[callArg]] = mockedStreamText.mock.calls;
			expect(callArg.system).toContain('Current Song');
			expect(callArg.system).toContain('Current Artist');
			expect(callArg.system).toContain('2 tracks');
		});

		it('should pass tools to AI', async () => {
			const tracks = [createMockTrack()];
			const mockQueue = createMockQueue(tracks);
			const interaction = createMockInteraction('test');

			mockedUseQueue.mockReturnValue(mockQueue);
			mockedStreamText.mockReturnValue(createMockStream() as never);

			await promptCommandHandler(interaction);

			expect(mockedStreamText).toHaveBeenCalledWith(
				expect.objectContaining({
					tools: expect.objectContaining({
						removeTracksByPattern: expect.anything(),
						moveTracksByPattern: expect.anything(),
						skipCurrentTrack: expect.anything(),
					}),
				}),
			);
		});

		it('should use gpt-4o-mini model with low temperature and multi-step execution', async () => {
			const tracks = [createMockTrack()];
			const mockQueue = createMockQueue(tracks);
			const interaction = createMockInteraction('test');

			mockedUseQueue.mockReturnValue(mockQueue);
			mockedStreamText.mockReturnValue(createMockStream() as never);

			await promptCommandHandler(interaction);

			expect(mockedOpenai).toHaveBeenCalledWith('gpt-4o-mini');
			expect(mockedStreamText).toHaveBeenCalledWith(
				expect.objectContaining({
					stopWhen: expect.anything(),
					temperature: 0.1,
				}),
			);
		});

		it('should pass optimized queue data to AI', async () => {
			const tracks = [
				createMockTrack({
					title: 'Song 1',
					author: 'Artist 1',
					duration: '3:45',
				}),
			];
			const mockQueue = createMockQueue(tracks);
			const interaction = createMockInteraction('test');

			mockedUseQueue.mockReturnValue(mockQueue);
			mockedStreamText.mockReturnValue(createMockStream() as never);

			await promptCommandHandler(interaction);

			const [[callArg]] = mockedStreamText.mock.calls;
			expect(callArg.prompt).toContain('Song 1');
			expect(callArg.prompt).toContain('Artist 1');
			expect(callArg.prompt).toContain('3:45');
			expect(callArg.prompt).not.toContain('https://');
		});
	});
});
