import { type MistralLanguageModelOptions, mistral } from '@ai-sdk/mistral';
import {
	type OpenAILanguageModelResponsesOptions,
	openai,
} from '@ai-sdk/openai';
import { stepCountIs, streamText, type Tool, tool } from 'ai';
import type {
	ChatInputCommandInteraction,
	VoiceBasedChannel,
} from 'discord.js';
import type { GuildQueue } from 'discord-player';
import PQueue from 'p-queue';
import { z } from 'zod';
import {
	generateSystemPrompt,
	type ToolContext,
	type ToolResult,
} from '../utils/promptTools';

const OPENAI_PROVIDER_OPTIONS: OpenAILanguageModelResponsesOptions = {
	parallelToolCalls: true,
};

interface ModelConfig {
	id: string;
	label: string;
	provider: 'openai' | 'mistral';
	reasoningEffort?: 'low' | 'medium' | 'high';
}

const MODEL_CONFIGS: ModelConfig[] = [
	{
		id: 'gpt-5-mini',
		label: 'gpt-5-mini (low)',
		provider: 'openai',
		reasoningEffort: 'low',
	},
	{
		id: 'gpt-5-nano',
		label: 'gpt-5-nano (low)',
		provider: 'openai',
		reasoningEffort: 'low',
	},
	{ id: 'gpt-4.1-mini', label: 'gpt-4.1-mini', provider: 'openai' },
	{ id: 'gpt-4o-mini', label: 'gpt-4o-mini', provider: 'openai' },
	{
		id: 'mistral-small-latest',
		label: 'mistral-small-4',
		provider: 'mistral',
	},
	{
		id: 'mistral-small-latest',
		label: 'mistral-small-4 (thinking)',
		provider: 'mistral',
		reasoningEffort: 'high',
	},
	{
		id: 'mistral-medium-latest',
		label: 'mistral-medium-3.1',
		provider: 'mistral',
	},
	{ id: 'ministral-8b-latest', label: 'ministral-8b', provider: 'mistral' },
	{ id: 'ministral-3b-latest', label: 'ministral-3b', provider: 'mistral' },
];

const REASONING_MODELS = new Set([
	'gpt-5-mini',
	'gpt-5-nano',
	'mistral-small-latest',
]);

const CONCURRENCY = 20;

interface QueueTrack {
	index: number;
	title: string;
	author: string;
	duration: string;
}

const QUEUE_TRACKS: QueueTrack[] = [
	{ index: 0, title: "God's Plan", author: 'Drake', duration: '3:18' },
	{ index: 1, title: 'Hotline Bling', author: 'Drake', duration: '4:27' },
	{ index: 2, title: 'Anti-Hero', author: 'Taylor Swift', duration: '3:20' },
	{
		index: 3,
		title: 'Shake It Off',
		author: 'Taylor Swift',
		duration: '3:39',
	},
	{
		index: 4,
		title: 'Blinding Lights',
		author: 'The Weeknd',
		duration: '3:20',
	},
	{
		index: 5,
		title: 'Save Your Tears',
		author: 'The Weeknd',
		duration: '3:35',
	},
	{
		index: 6,
		title: 'The Less I Know the Better',
		author: 'Tame Impala',
		duration: '3:36',
	},
	{
		index: 7,
		title: 'Let It Happen',
		author: 'Tame Impala',
		duration: '7:46',
	},
	{
		index: 8,
		title: 'Do I Wanna Know?',
		author: 'Arctic Monkeys',
		duration: '4:32',
	},
	{ index: 9, title: '505', author: 'Arctic Monkeys', duration: '4:13' },
	{
		index: 10,
		title: 'Shape of You',
		author: 'Ed Sheeran',
		duration: '3:53',
	},
	{ index: 11, title: 'Get Lucky', author: 'Daft Punk', duration: '6:09' },
	{
		index: 12,
		title: 'Around the World',
		author: 'Daft Punk',
		duration: '7:09',
	},
	{
		index: 13,
		title: 'HUMBLE.',
		author: 'Kendrick Lamar',
		duration: '2:57',
	},
	{ index: 14, title: 'Kill Bill', author: 'SZA', duration: '2:33' },
	{
		index: 15,
		title: 'vampire',
		author: 'Olivia Rodrigo',
		duration: '3:39',
	},
	{ index: 16, title: 'Hotline Bling', author: 'Drake', duration: '4:27' },
];

const CURRENT_TRACK = { title: 'bad guy', author: 'Billie Eilish' };

const AVAILABLE_PLAYLISTS = [
	'chill-vibes',
	'jazz-classics',
	'rock-anthems',
	'workout',
];

interface RecordedToolCall {
	name: string;
	args: Record<string, unknown>;
}

interface PromptResult {
	prompt: string;
	score: number;
	ttftMs: number;
	totalMs: number;
	toolsCalled: string[];
	error?: string;
}

interface ModelResult {
	model: string;
	results: PromptResult[];
}

const READ_ONLY_TOOLS = new Set([
	'getQueueStatus',
	'listTracks',
	'listAvailablePlaylists',
]);

function filterActionCalls(calls: RecordedToolCall[]): RecordedToolCall[] {
	return calls.filter((call) => !READ_ONLY_TOOLS.has(call.name));
}

function createMockTools(recorder: RecordedToolCall[]): Record<string, Tool> {
	return {
		getQueueStatus: tool({
			description:
				'Get the current queue status including now playing track, total track count, and playback state (paused, volume)',
			inputSchema: z.object({}),
			execute: async () => {
				recorder.push({ name: 'getQueueStatus', args: {} });
				return {
					success: true,
					currentTrack: {
						title: CURRENT_TRACK.title,
						author: CURRENT_TRACK.author,
						duration: '3:14',
					},
					trackCount: QUEUE_TRACKS.length,
					isPaused: false,
					volume: 50,
				};
			},
		}),
		listTracks: tool({
			description:
				'List tracks in the queue with their index, title, author, and duration. Supports pagination for large queues.',
			inputSchema: z.object({
				offset: z
					.number()
					.min(0)
					.optional()
					.describe('Starting index (default 0)'),
				limit: z
					.number()
					.min(1)
					.max(50)
					.optional()
					.describe('Number of tracks to return (default 25, max 50)'),
			}),
			execute: async (args) => {
				recorder.push({ name: 'listTracks', args });
				const offset = (args.offset as number | undefined) ?? 0;
				const limit = (args.limit as number | undefined) ?? 25;
				const slice = QUEUE_TRACKS.slice(offset, offset + limit);
				return {
					success: true,
					tracks: slice,
					total: QUEUE_TRACKS.length,
					hasMore: offset + limit < QUEUE_TRACKS.length,
				};
			},
		}),
		removeTracksByPattern: tool({
			description:
				'Remove all tracks from the queue that match a pattern (artist name, title, or both)',
			inputSchema: z.object({
				artistPattern: z
					.string()
					.nullish()
					.describe('Artist name pattern to match (case-insensitive)'),
				titlePattern: z
					.string()
					.nullish()
					.describe('Track title pattern to match (case-insensitive)'),
			}),
			execute: async (args) => {
				recorder.push({ name: 'removeTracksByPattern', args });
				return { success: true, removedCount: 3 } satisfies ToolResult;
			},
		}),
		moveTracksByPattern: tool({
			description:
				'Move all tracks matching a pattern to a specific position in the queue (0 = front, -1 = end). Only moves tracks — does not skip or start playback.',
			inputSchema: z.object({
				artistPattern: z
					.string()
					.nullish()
					.describe('Artist name pattern to match (case-insensitive)'),
				titlePattern: z
					.string()
					.nullish()
					.describe('Track title pattern to match (case-insensitive)'),
				position: z
					.number()
					.describe('Target position (0 = front of queue, -1 = end of queue)'),
			}),
			execute: async (args) => {
				recorder.push({ name: 'moveTracksByPattern', args });
				return { success: true, movedCount: 2 } satisfies ToolResult;
			},
		}),
		skipCurrentTrack: tool({
			description:
				'Skip the currently playing track to play the next track in queue',
			inputSchema: z.object({}),
			execute: async () => {
				recorder.push({ name: 'skipCurrentTrack', args: {} });
				return { success: true, skippedCurrent: true } satisfies ToolResult;
			},
		}),
		pausePlayback: tool({
			description: 'Pause the currently playing track',
			inputSchema: z.object({}),
			execute: async () => {
				recorder.push({ name: 'pausePlayback', args: {} });
				return { success: true } satisfies ToolResult;
			},
		}),
		resumePlayback: tool({
			description: 'Resume the paused track',
			inputSchema: z.object({}),
			execute: async () => {
				recorder.push({ name: 'resumePlayback', args: {} });
				return { success: true } satisfies ToolResult;
			},
		}),
		setVolume: tool({
			description:
				'Set the playback volume (0-100, where 100 is maximum volume)',
			inputSchema: z.object({
				volume: z.number().min(0).max(100).describe('Volume level (0-100)'),
			}),
			execute: async (args) => {
				recorder.push({ name: 'setVolume', args });
				return { success: true, volume: args.volume } satisfies ToolResult;
			},
		}),
		deduplicateQueue: tool({
			description: 'Remove duplicate tracks from the queue',
			inputSchema: z.object({}),
			execute: async () => {
				recorder.push({ name: 'deduplicateQueue', args: {} });
				return { success: true, removedCount: 1 } satisfies ToolResult;
			},
		}),
		searchAndPlay: tool({
			description:
				'Search for a song or artist and add the best match to the queue. Supports song names, artist names, YouTube URLs, and Spotify URLs.',
			inputSchema: z.object({
				query: z
					.string()
					.describe(
						'Search query - can be a song name, artist name, YouTube URL, or Spotify URL',
					),
			}),
			execute: async (args) => {
				recorder.push({ name: 'searchAndPlay', args });
				const query = args.query as string;
				return {
					success: true,
					trackTitle: query,
					trackAuthor: 'Various Artists',
				} satisfies ToolResult;
			},
		}),
		listAvailablePlaylists: tool({
			description: 'List all available internal playlists that can be enqueued',
			inputSchema: z.object({}),
			execute: async () => {
				recorder.push({ name: 'listAvailablePlaylists', args: {} });
				return { success: true, playlists: AVAILABLE_PLAYLISTS };
			},
		}),
		enqueuePlaylist: tool({
			description:
				'Enqueue all songs from an internal playlist by its ID. Use listAvailablePlaylists first to discover available playlist IDs.',
			inputSchema: z.object({
				playlistId: z
					.string()
					.describe('The ID of the internal playlist to enqueue'),
			}),
			execute: async (args) => {
				recorder.push({ name: 'enqueuePlaylist', args });
				return {
					success: true,
					enqueuedCount: 12,
					totalCount: 12,
				} satisfies ToolResult;
			},
		}),
	};
}

function matchesPattern(
	actual: string | null | undefined,
	expected: string,
): boolean {
	if (!actual) return false;
	return actual.toLowerCase().includes(expected.toLowerCase());
}

function hasToolCall(
	calls: RecordedToolCall[],
	name: string,
	params?: Record<string, unknown>,
): boolean {
	return calls.some((call) => {
		if (call.name !== name) return false;
		if (!params) return true;
		for (const [key, value] of Object.entries(params)) {
			if (typeof value === 'string') {
				if (!matchesPattern(call.args[key] as string | null | undefined, value))
					return false;
			} else if (call.args[key] !== value) {
				return false;
			}
		}
		return true;
	});
}

interface TestCase {
	prompt: string;
	score: (calls: RecordedToolCall[]) => number;
}

const TEST_CASES: TestCase[] = [
	{
		prompt: 'skip this song',
		score: (rawCalls) => {
			const calls = filterActionCalls(rawCalls);
			if (calls.length !== 1 || calls[0].name !== 'skipCurrentTrack') return 0;
			return 1;
		},
	},
	{
		prompt: 'remove all Drake songs',
		score: (rawCalls) => {
			const calls = filterActionCalls(rawCalls);
			const removeCalls = calls.filter(
				(call) => call.name === 'removeTracksByPattern',
			);
			if (removeCalls.length === 0 || calls.length !== removeCalls.length)
				return 0;
			const hasDrake = removeCalls.some((call) =>
				matchesPattern(call.args.artistPattern as string, 'drake'),
			);
			if (!hasDrake) return 0;
			if (removeCalls.length === 1) return 1;
			return 0.5;
		},
	},
	{
		prompt: 'set volume to 30',
		score: (rawCalls) => {
			const calls = filterActionCalls(rawCalls);
			if (calls.length !== 1 || calls[0].name !== 'setVolume') return 0;
			if (calls[0].args.volume === 30) return 1;
			return 0.5;
		},
	},
	{
		prompt: 'make it quieter',
		score: (rawCalls) => {
			const calls = filterActionCalls(rawCalls);
			if (calls.length !== 1 || calls[0].name !== 'setVolume') return 0;
			const volume = calls[0].args.volume as number;
			if (typeof volume === 'number' && volume < 100) return 1;
			return 0.5;
		},
	},
	{
		prompt: 'remove all ed sheeran songs and move weeknd to the front',
		score: (rawCalls) => {
			const calls = filterActionCalls(rawCalls);
			const hasRemove = hasToolCall(calls, 'removeTracksByPattern', {
				artistPattern: 'ed sheeran',
			});
			const hasMove = hasToolCall(calls, 'moveTracksByPattern', {
				artistPattern: 'weeknd',
				position: 0,
			});
			if (hasRemove && hasMove && calls.length === 2) return 1;
			if (hasRemove && hasMove) return 0.5;
			const names = calls.map((call) => call.name);
			if (
				names.includes('removeTracksByPattern') &&
				names.includes('moveTracksByPattern')
			)
				return 0.5;
			return 0;
		},
	},
	{
		prompt: 'remove the song called Blinding Lights',
		score: (rawCalls) => {
			const calls = filterActionCalls(rawCalls);
			const removeCalls = calls.filter(
				(call) => call.name === 'removeTracksByPattern',
			);
			if (removeCalls.length === 0 || calls.length !== removeCalls.length)
				return 0;
			const hasTitle = removeCalls.some((call) =>
				matchesPattern(call.args.titlePattern as string, 'blinding lights'),
			);
			const hasArtist = removeCalls.some((call) =>
				matchesPattern(call.args.artistPattern as string, 'blinding lights'),
			);
			if (hasTitle && removeCalls.length === 1) return 1;
			if (hasTitle) return 0.5;
			if (hasArtist) return 0.5;
			return 0;
		},
	},
	{
		prompt: 'move everything by Daft Punk to the end of the queue',
		score: (rawCalls) => {
			const calls = filterActionCalls(rawCalls);
			if (calls.length !== 1 || calls[0].name !== 'moveTracksByPattern')
				return 0;
			const correctArtist = matchesPattern(
				calls[0].args.artistPattern as string,
				'daft punk',
			);
			const correctPosition = calls[0].args.position === -1;
			if (correctArtist && correctPosition) return 1;
			if (correctArtist) return 0.5;
			return 0;
		},
	},
	{
		prompt: 'remove all songs by both Drake and Taylor Swift',
		score: (rawCalls) => {
			const calls = filterActionCalls(rawCalls);
			const removeCalls = calls.filter(
				(call) => call.name === 'removeTracksByPattern',
			);
			if (removeCalls.length < 2 || calls.length !== removeCalls.length)
				return removeCalls.length >= 2 ? 0.5 : 0;
			const hasDrake = removeCalls.some((call) =>
				matchesPattern(call.args.artistPattern as string, 'drake'),
			);
			const hasTaylor = removeCalls.some((call) =>
				matchesPattern(call.args.artistPattern as string, 'taylor swift'),
			);
			if (hasDrake && hasTaylor && removeCalls.length === 2) return 1;
			if (hasDrake && hasTaylor) return 0.5;
			return 0;
		},
	},
	{
		prompt: 'I want to hear Arctic Monkeys next',
		score: (rawCalls) => {
			const calls = filterActionCalls(rawCalls);
			const hasMove = hasToolCall(calls, 'moveTracksByPattern', {
				artistPattern: 'arctic monkeys',
				position: 0,
			});
			const hasSkip = hasToolCall(calls, 'skipCurrentTrack');
			if (hasMove && hasSkip && calls.length === 2) return 1;
			if (hasMove && hasSkip) return 0.5;
			if (calls.some((call) => call.name === 'moveTracksByPattern')) return 0.5;
			return 0;
		},
	},
	{
		prompt: 'remove Drake, move Kendrick to front, and skip the current track',
		score: (rawCalls) => {
			const calls = filterActionCalls(rawCalls);
			const hasRemove = hasToolCall(calls, 'removeTracksByPattern', {
				artistPattern: 'drake',
			});
			const hasMove = hasToolCall(calls, 'moveTracksByPattern', {
				artistPattern: 'kendrick',
				position: 0,
			});
			const hasSkip = hasToolCall(calls, 'skipCurrentTrack');
			if (hasRemove && hasMove && hasSkip && calls.length === 3) return 1;
			if (hasRemove && hasMove && hasSkip) return 0.5;
			const correct = [hasRemove, hasMove, hasSkip].filter(Boolean).length;
			if (correct >= 2) return 0.5;
			return 0;
		},
	},
	{
		prompt: 'clean up the queue and lower the volume to 20',
		score: (rawCalls) => {
			const calls = filterActionCalls(rawCalls);
			const hasDedup = hasToolCall(calls, 'deduplicateQueue');
			const hasVolume = hasToolCall(calls, 'setVolume', { volume: 20 });
			if (hasDedup && hasVolume && calls.length === 2) return 1;
			if (hasDedup && hasVolume) return 0.5;
			const names = calls.map((call) => call.name);
			if (names.includes('deduplicateQueue') && names.includes('setVolume'))
				return 0.5;
			return 0;
		},
	},
	{
		prompt: 'remove everything except Tame Impala',
		score: (rawCalls) => {
			const calls = filterActionCalls(rawCalls);
			const otherArtists = [
				'drake',
				'taylor swift',
				'the weeknd',
				'arctic monkeys',
				'ed sheeran',
				'daft punk',
				'kendrick lamar',
				'sza',
				'olivia rodrigo',
			];
			const removeCalls = calls.filter(
				(call) => call.name === 'removeTracksByPattern',
			);
			if (removeCalls.length === 0 || calls.length !== removeCalls.length)
				return 0;
			const removedTameImpala = removeCalls.some(
				(call) =>
					matchesPattern(call.args.artistPattern as string, 'tame impala') ||
					matchesPattern(call.args.titlePattern as string, 'tame impala'),
			);
			if (removedTameImpala) return 0;
			const matchedArtists = otherArtists.filter((artist) =>
				removeCalls.some((call) =>
					matchesPattern(call.args.artistPattern as string, artist),
				),
			);
			if (matchedArtists.length >= 8) return 1;
			if (matchedArtists.length >= 5) return 0.5;
			return 0;
		},
	},
	{
		prompt: 'remove all songs longer than 5 minutes',
		score: (rawCalls) => {
			const calls = filterActionCalls(rawCalls);
			const longSongs = ['let it happen', 'get lucky', 'around the world'];
			const removeCalls = calls.filter(
				(call) => call.name === 'removeTracksByPattern',
			);
			if (removeCalls.length === 0 || calls.length !== removeCalls.length)
				return 0;
			const matchedSongs = longSongs.filter((song) =>
				removeCalls.some((call) =>
					matchesPattern(call.args.titlePattern as string, song),
				),
			);
			if (matchedSongs.length === 3) return 1;
			if (matchedSongs.length >= 2) return 0.5;
			return 0;
		},
	},
	{
		prompt: 'sort the queue by song length',
		score: (rawCalls) => {
			const calls = filterActionCalls(rawCalls);
			return calls.length === 0 ? 1 : 0;
		},
	},
	{
		prompt: 'play some Radiohead',
		score: (rawCalls) => {
			const calls = filterActionCalls(rawCalls);
			const searchCalls = calls.filter((call) => call.name === 'searchAndPlay');
			if (searchCalls.length !== 1 || calls.length !== 1) return 0;
			if (matchesPattern(searchCalls[0].args.query as string, 'radiohead'))
				return 1;
			return 0.5;
		},
	},
	{
		prompt: 'add Bohemian Rhapsody by Queen to the queue',
		score: (rawCalls) => {
			const calls = filterActionCalls(rawCalls);
			const searchCalls = calls.filter((call) => call.name === 'searchAndPlay');
			if (searchCalls.length === 0 || calls.length !== searchCalls.length)
				return 0;
			const hasCorrectQuery = searchCalls.some((call) => {
				const query = (call.args.query as string) ?? '';
				return matchesPattern(query, 'bohemian rhapsody');
			});
			if (!hasCorrectQuery) return 0.5;
			if (searchCalls.length === 1) return 1;
			return 0.5;
		},
	},
	{
		prompt: 'play the workout playlist',
		score: (rawCalls) => {
			const calls = filterActionCalls(rawCalls);
			const enqueueCalls = calls.filter(
				(call) => call.name === 'enqueuePlaylist',
			);
			if (enqueueCalls.length !== 1 || calls.length !== 1) return 0;
			if (matchesPattern(enqueueCalls[0].args.playlistId as string, 'workout'))
				return 1;
			return 0.5;
		},
	},
	{
		prompt: 'enqueue the jazz playlist and skip the current song',
		score: (rawCalls) => {
			const calls = filterActionCalls(rawCalls);
			const hasEnqueue = hasToolCall(calls, 'enqueuePlaylist', {
				playlistId: 'jazz',
			});
			const hasSkip = hasToolCall(calls, 'skipCurrentTrack');
			if (hasEnqueue && hasSkip && calls.length === 2) return 1;
			if (hasEnqueue && hasSkip) return 0.5;
			if (calls.some((call) => call.name === 'enqueuePlaylist')) return 0.5;
			return 0;
		},
	},
	{
		prompt: 'play the rock playlist and remove all Drake songs',
		score: (rawCalls) => {
			const calls = filterActionCalls(rawCalls);
			const hasEnqueue = hasToolCall(calls, 'enqueuePlaylist', {
				playlistId: 'rock',
			});
			const hasRemove = hasToolCall(calls, 'removeTracksByPattern', {
				artistPattern: 'drake',
			});
			if (hasEnqueue && hasRemove && calls.length === 2) return 1;
			if (hasEnqueue && hasRemove) return 0.5;
			const names = calls.map((call) => call.name);
			if (
				names.includes('enqueuePlaylist') &&
				names.includes('removeTracksByPattern')
			)
				return 0.5;
			return 0;
		},
	},
];

const TOOL_ABBREVIATIONS: Record<string, string> = {
	getQueueStatus: 'status',
	listTracks: 'list',
	removeTracksByPattern: 'remove',
	moveTracksByPattern: 'move',
	skipCurrentTrack: 'skip',
	pausePlayback: 'pause',
	resumePlayback: 'resume',
	setVolume: 'volume',
	deduplicateQueue: 'dedup',
	searchAndPlay: 'search',
	listAvailablePlaylists: 'playlists',
	enqueuePlaylist: 'enqueue',
};

function formatToolCalls(names: string[]): string {
	if (names.length === 0) return '(none)';
	const counts = new Map<string, number>();
	for (const name of names) {
		counts.set(name, (counts.get(name) ?? 0) + 1);
	}
	return Array.from(counts.entries())
		.map(([name, count]) => {
			const abbr = TOOL_ABBREVIATIONS[name] ?? name;
			return count > 1 ? `${abbr} ×${count}` : abbr;
		})
		.join(', ');
}

function pad(
	str: string,
	len: number,
	align: 'left' | 'center' | 'right' = 'left',
): string {
	const truncated = str.length > len ? `${str.slice(0, len - 1)}…` : str;
	const padding = len - truncated.length;
	if (align === 'center') {
		const left = Math.floor(padding / 2);
		return ' '.repeat(left) + truncated + ' '.repeat(padding - left);
	}
	if (align === 'right') {
		return ' '.repeat(padding) + truncated;
	}
	return truncated + ' '.repeat(padding);
}

function formatTime(ms: number): string {
	return ms > 0 ? `${(ms / 1000).toFixed(1)}s` : '—';
}

const COL = { num: 4, prompt: 34, score: 7, ttft: 8, total: 8, tools: 30 };

function horizontalLine(
	left: string,
	mid: string,
	right: string,
	fill = '─',
): string {
	return (
		left +
		fill.repeat(COL.num) +
		mid +
		fill.repeat(COL.prompt) +
		mid +
		fill.repeat(COL.score) +
		mid +
		fill.repeat(COL.ttft) +
		mid +
		fill.repeat(COL.total) +
		mid +
		fill.repeat(COL.tools) +
		right
	);
}

function dataRow(
	num: string,
	prompt: string,
	score: string,
	ttft: string,
	total: string,
	tools: string,
): string {
	return (
		'│' +
		pad(num, COL.num, 'right') +
		'│' +
		pad(prompt, COL.prompt) +
		'│' +
		pad(score, COL.score, 'center') +
		'│' +
		pad(ttft, COL.ttft, 'center') +
		'│' +
		pad(total, COL.total, 'center') +
		'│' +
		pad(tools, COL.tools) +
		'│'
	);
}

function renderModelTable(modelResult: ModelResult): string {
	const lines: string[] = [];
	const totalWidth =
		COL.num + COL.prompt + COL.score + COL.ttft + COL.total + COL.tools + 7;

	lines.push(`┌${'─'.repeat(totalWidth - 2)}┐`);
	lines.push(`│${pad(` ${modelResult.model}`, totalWidth - 2)}│`);
	lines.push(horizontalLine('├', '┬', '┤'));
	lines.push(
		dataRow(' # ', ' Prompt', ' Score ', ' TTFT ', ' Total ', ' Tools called'),
	);
	lines.push(horizontalLine('├', '┼', '┤'));

	let totalScore = 0;
	let totalTtft = 0;
	let totalTime = 0;
	let ttftCount = 0;

	for (let idx = 0; idx < modelResult.results.length; idx++) {
		const result = modelResult.results[idx];
		totalScore += result.score;
		totalTime += result.totalMs;
		if (result.ttftMs > 0) {
			totalTtft += result.ttftMs;
			ttftCount++;
		}
		lines.push(
			dataRow(
				` ${idx + 1} `,
				` ${result.prompt}`,
				result.score.toFixed(1),
				formatTime(result.ttftMs),
				formatTime(result.totalMs),
				` ${formatToolCalls(result.toolsCalled)}`,
			),
		);
	}

	lines.push(horizontalLine('├', '┼', '┤'));
	const avgTtft = ttftCount > 0 ? totalTtft / ttftCount : 0;
	const avgTime = totalTime / modelResult.results.length;
	lines.push(
		dataRow(
			'',
			' Total',
			`${totalScore}/${modelResult.results.length}`,
			formatTime(avgTtft),
			formatTime(avgTime),
			'',
		),
	);
	lines.push(horizontalLine('└', '┴', '┘'));

	return lines.join('\n');
}

const COMP_COL = { model: 22, score: 7, ttft: 10, time: 10, pass: 11 };

function compHorizontalLine(
	left: string,
	mid: string,
	right: string,
	fill = '─',
): string {
	return (
		left +
		fill.repeat(COMP_COL.model) +
		mid +
		fill.repeat(COMP_COL.score) +
		mid +
		fill.repeat(COMP_COL.ttft) +
		mid +
		fill.repeat(COMP_COL.time) +
		mid +
		fill.repeat(COMP_COL.pass) +
		right
	);
}

function compRow(
	model: string,
	score: string,
	ttft: string,
	time: string,
	pass: string,
): string {
	return (
		'│' +
		pad(model, COMP_COL.model) +
		'│' +
		pad(score, COMP_COL.score, 'center') +
		'│' +
		pad(ttft, COMP_COL.ttft, 'center') +
		'│' +
		pad(time, COMP_COL.time, 'center') +
		'│' +
		pad(pass, COMP_COL.pass, 'center') +
		'│'
	);
}

function renderComparisonTable(modelResults: ModelResult[]): string {
	const lines: string[] = [];
	const totalWidth =
		COMP_COL.model +
		COMP_COL.score +
		COMP_COL.ttft +
		COMP_COL.time +
		COMP_COL.pass +
		6;

	lines.push(`┌${'─'.repeat(totalWidth - 2)}┐`);
	lines.push(`│${pad(' Model Comparison', totalWidth - 2)}│`);
	lines.push(compHorizontalLine('├', '┬', '┤'));
	lines.push(
		compRow(' Model', ' Score ', ' Avg TTFT ', ' Avg Time ', ' Pass Rate '),
	);
	lines.push(compHorizontalLine('├', '┼', '┤'));

	for (const modelResult of modelResults) {
		const results = modelResult.results;
		const totalScore = results.reduce((sum, result) => sum + result.score, 0);
		const ttftValues = results
			.filter((result) => result.ttftMs > 0)
			.map((result) => result.ttftMs);
		const avgTtft =
			ttftValues.length > 0
				? ttftValues.reduce((a, b) => a + b, 0) / ttftValues.length
				: 0;
		const avgTime =
			results.reduce((sum, result) => sum + result.totalMs, 0) / results.length;
		const passRate = (totalScore / results.length) * 100;

		lines.push(
			compRow(
				` ${modelResult.model}`,
				`${totalScore}/${results.length}`,
				formatTime(avgTtft),
				formatTime(avgTime),
				`${passRate.toFixed(0)}%`,
			),
		);
	}

	lines.push(compHorizontalLine('└', '┴', '┘'));
	return lines.join('\n');
}

async function runPrompt(
	config: ModelConfig,
	testCase: TestCase,
): Promise<PromptResult> {
	const recorder: RecordedToolCall[] = [];
	const tools = createMockTools(recorder);

	const toolContext: ToolContext = {
		queue: {} as GuildQueue,
		currentTrackTitle: CURRENT_TRACK.title,
		currentTrackAuthor: CURRENT_TRACK.author,
		trackCount: QUEUE_TRACKS.length,
		interaction: {} as ChatInputCommandInteraction,
		voiceChannel: {} as VoiceBasedChannel,
	};

	const startTime = performance.now();
	let ttftMs = 0;

	try {
		const model =
			config.provider === 'mistral' ? mistral(config.id) : openai(config.id);

		const result = streamText({
			model,
			system: generateSystemPrompt(toolContext),
			prompt: `User request: "${testCase.prompt}"`,
			tools,
			stopWhen: stepCountIs(5),
			maxRetries: 2,
			...(REASONING_MODELS.has(config.id) ? {} : { temperature: 0.1 }),
			providerOptions:
				config.provider === 'mistral'
					? {
							mistral: {
								parallelToolCalls: true,
								...(config.reasoningEffort && {
									reasoningEffort: config.reasoningEffort as 'high' | 'none',
								}),
							} satisfies MistralLanguageModelOptions,
						}
					: {
							openai: {
								...OPENAI_PROVIDER_OPTIONS,
								...(config.reasoningEffort && {
									reasoningEffort: config.reasoningEffort,
								}),
							} satisfies OpenAILanguageModelResponsesOptions,
						},
		});

		for await (const part of result.fullStream) {
			if (part.type === 'tool-call' && ttftMs === 0) {
				ttftMs = performance.now() - startTime;
			}
		}

		const totalMs = performance.now() - startTime;
		const score = testCase.score(recorder);

		return {
			prompt: testCase.prompt,
			score,
			ttftMs,
			totalMs,
			toolsCalled: recorder.map((recorded) => recorded.name),
		};
	} catch (error) {
		const totalMs = performance.now() - startTime;
		return {
			prompt: testCase.prompt,
			score: 0,
			ttftMs: 0,
			totalMs,
			toolsCalled: [],
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

async function main() {
	if (!process.env.OPENAI_API_KEY) {
		console.error('OPENAI_API_KEY environment variable is required');
		process.exit(1);
	}

	const totalTasks = MODEL_CONFIGS.length * TEST_CASES.length;
	console.log('Prompt Benchmark');
	console.log(
		`Running ${TEST_CASES.length} prompts × ${MODEL_CONFIGS.length} models = ${totalTasks} tasks (concurrency: ${CONCURRENCY})\n`,
	);

	const queue = new PQueue({ concurrency: CONCURRENCY });
	const resultsByModel = new Map<string, PromptResult[]>();
	let completed = 0;

	for (const config of MODEL_CONFIGS) {
		resultsByModel.set(
			config.label,
			new Array<PromptResult>(TEST_CASES.length),
		);
	}

	for (const config of MODEL_CONFIGS) {
		const results = resultsByModel.get(config.label);
		if (!results) continue;

		for (let idx = 0; idx < TEST_CASES.length; idx++) {
			const testCase = TEST_CASES[idx];
			queue.add(async () => {
				const result = await runPrompt(config, testCase);
				results[idx] = result;
				completed++;
				process.stdout.write(`\r  Progress: ${completed}/${totalTasks}`);
			});
		}
	}

	await queue.onIdle();
	console.log('\n');

	const modelResults: ModelResult[] = MODEL_CONFIGS.map((config) => ({
		model: config.label,
		results: resultsByModel.get(config.label) ?? [],
	}));

	for (const result of modelResults) {
		console.log(renderModelTable(result));
		console.log('');
	}

	console.log(renderComparisonTable(modelResults));
}

main().then(() => process.exit(0));
