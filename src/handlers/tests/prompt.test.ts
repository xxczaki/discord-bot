import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { GuildQueue, Track } from 'discord-player';
import { useQueue } from 'discord-player';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROMPT_MODEL_ID } from '../../utils/promptTools';
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
						input: call.input,
						output: call.output,
					};
				}
			}
		})(),
		totalUsage: Promise.resolve({ inputTokens: 500, outputTokens: 100 }),
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
	currentTrack?: Track | null,
): GuildQueue {
	return {
		tracks: {
			toArray: vi.fn().mockReturnValue(tracks),
		},
		currentTrack:
			currentTrack === null
				? null
				: (currentTrack ??
					createMockTrack({ title: 'The Times They Are a-Changin' })),
		removeTrack: vi.fn(),
		moveTrack: vi.fn(),
		node: {
			skip: vi.fn(),
		},
	} as unknown as GuildQueue;
}

function getEmbedFromCall(
	interaction: ChatInputCommandInteraction,
	method: 'reply' | 'editReply',
	callIndex = -1,
) {
	const mock = vi.mocked(interaction[method]);
	const calls = mock.mock.calls;
	const call = callIndex === -1 ? calls.at(-1) : calls[callIndex];
	const arg = call?.[0] as {
		embeds?: Array<{ data: Record<string, unknown> }>;
	};
	return arg?.embeds?.[0]?.data;
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
				totalUsage: Promise.resolve({ inputTokens: 0, outputTokens: 0 }),
			} as never);

			await promptCommandHandler(interaction);

			const embed = getEmbedFromCall(interaction, 'editReply');
			expect(embed?.color).toBe(0xed4245); // Red
			expect(embed?.description).toContain('Something went wrong');
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
				totalUsage: Promise.resolve({ inputTokens: 0, outputTokens: 0 }),
			} as never);

			await promptCommandHandler(interaction);

			const embed = getEmbedFromCall(interaction, 'editReply');
			expect(embed?.color).toBe(0xed4245); // Red
			expect(embed?.description).toContain('Something went wrong');
		});

		it('should handle tool-result with undefined output', async () => {
			const tracks = [createMockTrack()];
			const mockQueue = createMockQueue(tracks);
			const interaction = createMockInteraction('test');

			mockedUseQueue.mockReturnValue(mockQueue);
			mockedStreamText.mockReturnValue({
				fullStream: (async function* () {
					yield {
						type: 'tool-call' as const,
						toolName: 'skipCurrentTrack',
						toolCallId: 'call-no-output',
						input: {},
					};

					yield {
						type: 'tool-result' as const,
						toolCallId: 'call-no-output',
						toolName: 'skipCurrentTrack',
					};
				})(),
				totalUsage: Promise.resolve({ inputTokens: 100, outputTokens: 50 }),
			} as never);

			await promptCommandHandler(interaction);

			const embed = getEmbedFromCall(interaction, 'editReply');
			expect(embed?.description).toContain('✅');
		});

		it('should skip tool-result with unknown toolCallId', async () => {
			const tracks = [createMockTrack()];
			const mockQueue = createMockQueue(tracks);
			const interaction = createMockInteraction('test');

			mockedUseQueue.mockReturnValue(mockQueue);
			mockedStreamText.mockReturnValue({
				fullStream: (async function* () {
					yield {
						type: 'tool-result' as const,
						toolCallId: 'unknown-call-id',
						toolName: 'removeTracksByPattern',
						input: { artistPattern: 'test' },
						output: { success: true, removedCount: 1 },
					};
				})(),
				totalUsage: Promise.resolve({ inputTokens: 100, outputTokens: 50 }),
			} as never);

			await promptCommandHandler(interaction);

			const embed = getEmbedFromCall(interaction, 'editReply');
			expect(embed?.description).toContain('No actions were performed');
			expect(embed?.color).toBe(0xed4245); // Red
		});

		it('should handle stream error events', async () => {
			const tracks = [createMockTrack()];
			const mockQueue = createMockQueue(tracks);
			const interaction = createMockInteraction('test');

			mockedUseQueue.mockReturnValue(mockQueue);
			mockedStreamText.mockReturnValue({
				fullStream: (async function* () {
					yield {
						type: 'error' as const,
						error: 'Stream processing error',
					};

					yield {
						type: 'tool-call' as const,
						toolName: 'removeTracksByPattern',
						toolCallId: 'call-123',
						input: { artistPattern: 'test' },
					};

					yield {
						type: 'tool-result' as const,
						toolCallId: 'call-123',
						toolName: 'removeTracksByPattern',
						input: { artistPattern: 'test' },
						output: { success: true, removedCount: 1 },
					};
				})(),
				totalUsage: Promise.resolve({ inputTokens: 200, outputTokens: 100 }),
			} as never);

			await promptCommandHandler(interaction);

			expect(interaction.editReply).toHaveBeenCalled();
		});
	});

	describe('basic functionality', () => {
		it('should reply with initial embed', async () => {
			const tracks = [
				createMockTrack(),
				createMockTrack({ title: 'Blowin in the Wind' }),
			];
			const mockQueue = createMockQueue(tracks);
			const interaction = createMockInteraction('show me the queue');

			mockedUseQueue.mockReturnValue(mockQueue);
			mockedStreamText.mockReturnValue(createMockStream() as never);

			await promptCommandHandler(interaction);

			const replyArg = vi.mocked(interaction.reply).mock.calls[0][0] as {
				embeds?: unknown[];
			};
			expect(replyArg.embeds).toHaveLength(1);
		});

		it('should use fallback values when currentTrack is null', async () => {
			const tracks = [createMockTrack()];
			const mockQueue = createMockQueue(tracks, null);
			const interaction = createMockInteraction('test');

			mockedUseQueue.mockReturnValue(mockQueue);
			mockedStreamText.mockReturnValue(createMockStream() as never);

			await promptCommandHandler(interaction);

			const [[callArg]] = mockedStreamText.mock.calls;
			expect(callArg.system).toContain('None');
			expect(callArg.system).toContain('N/A');
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

		it('should display embed with red color when no actions performed', async () => {
			const tracks = [createMockTrack()];
			const mockQueue = createMockQueue(tracks);
			const interaction = createMockInteraction('test');

			mockedUseQueue.mockReturnValue(mockQueue);
			mockedStreamText.mockReturnValue(createMockStream() as never);

			await promptCommandHandler(interaction);

			const embed = getEmbedFromCall(interaction, 'editReply');
			expect(embed?.title).toBe('❌ Prompt');
			expect(embed?.color).toBe(0xed4245); // Red
			expect(embed?.description).toContain('No actions were performed');
		});

		it('should include token usage in footer', async () => {
			const tracks = [createMockTrack()];
			const mockQueue = createMockQueue(tracks);
			const interaction = createMockInteraction('test');

			mockedUseQueue.mockReturnValue(mockQueue);
			mockedStreamText.mockReturnValue(createMockStream() as never);

			await promptCommandHandler(interaction);

			const embed = getEmbedFromCall(interaction, 'editReply');
			const footerText = (embed?.footer as { text?: string })?.text;
			expect(footerText).toContain(PROMPT_MODEL_ID);
			expect(footerText).toContain('600 tokens');
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

			const embed = getEmbedFromCall(interaction, 'editReply');
			expect(embed?.title).toBe('✅ Prompt');
			expect(embed?.color).toBe(0x57f287); // Green
			expect(embed?.description).toContain('✅');
			expect(embed?.description).toContain('Removed 3 tracks');
			expect(embed?.description).toContain('artistPattern: "bob dylan"');
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

			const embed = getEmbedFromCall(interaction, 'editReply');
			expect(embed?.description).toContain('✅');
			expect(embed?.description).toContain('Moved 2 tracks to front');
			expect(embed?.description).toContain('artistPattern: "artist 1"');
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

			const embed = getEmbedFromCall(interaction, 'editReply');
			const description = embed?.description as string;

			// Both actions should appear in the output
			expect(description).toContain('✅');
			expect(description).toContain('Moved 1 track');
			expect(description).toContain('Skipped current track');

			// They should appear on separate lines (history format)
			const lines = description.split('\n');
			expect(lines.length).toBeGreaterThanOrEqual(2);
		});

		it('should not include args for tools with no meaningful input', async () => {
			const tracks = [createMockTrack()];
			const mockQueue = createMockQueue(tracks);
			const interaction = createMockInteraction('skip');

			mockedUseQueue.mockReturnValue(mockQueue);
			mockedStreamText.mockReturnValue(
				createMockStream([
					{
						toolName: 'skipCurrentTrack',
						input: {},
						output: { success: true },
					},
				]) as never,
			);

			await promptCommandHandler(interaction);

			const embed = getEmbedFromCall(interaction, 'editReply');
			// Should just be "✅ Skipped current track" without parenthesized args
			expect(embed?.description).toBe('✅ Skipped current track');
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

		it('should use gpt-5-mini model with low temperature, multi-step execution, and provider options', async () => {
			const tracks = [createMockTrack()];
			const mockQueue = createMockQueue(tracks);
			const interaction = createMockInteraction('test');

			mockedUseQueue.mockReturnValue(mockQueue);
			mockedStreamText.mockReturnValue(createMockStream() as never);

			await promptCommandHandler(interaction);

			expect(mockedOpenai).toHaveBeenCalledWith(PROMPT_MODEL_ID);
			expect(mockedStreamText).toHaveBeenCalledWith(
				expect.objectContaining({
					stopWhen: expect.anything(),
					providerOptions: {
						openai: expect.objectContaining({
							parallelToolCalls: true,
							promptCacheKey: 'prompt-command',
							reasoningEffort: 'low',
						}),
					},
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
