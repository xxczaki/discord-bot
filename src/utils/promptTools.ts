import type { OpenAILanguageModelResponsesOptions } from '@ai-sdk/openai';
import { type Tool, tool } from 'ai';
import type {
	ChatInputCommandInteraction,
	VoiceBasedChannel,
} from 'discord.js';
import {
	type GuildQueue,
	type QueueFilters,
	useMainPlayer,
} from 'discord-player';
import { z } from 'zod';
import type { QueueMetadata } from '../types/QueueMetadata';
import cleanUpPlaylistContent from './cleanUpPlaylistContent';
import determineSearchEngine from './determineSearchEngine';
import getEnvironmentVariable from './getEnvironmentVariable';
import logger from './logger';
import pluralize from './pluralize';
import {
	deduplicateQueue,
	moveTracksByPattern,
	pausePlayback,
	removeTracksByPattern,
	resumePlayback,
	setVolume,
	skipCurrentTrack,
} from './queueOperations';
import { StatsHandler } from './StatsHandler';

export const PROMPT_MODEL_ID = 'gpt-4o-mini';

export const OPENAI_PROVIDER_OPTIONS = {
	parallelToolCalls: true,
	promptCacheKey: 'prompt-command',
} satisfies OpenAILanguageModelResponsesOptions;

const pluralizeTracks = pluralize('track', 'tracks');
const pluralizeDuplicates = pluralize('duplicate', 'duplicates');

const statsHandler = StatsHandler.getInstance();

export interface ToolResult {
	success?: boolean;
	removedCount?: number;
	movedCount?: number;
	skippedCurrent?: boolean;
	wasPaused?: boolean;
	volume?: number;
	trackTitle?: string;
	trackAuthor?: string;
	enqueuedCount?: number;
	totalCount?: number;
	error?: string;
	[key: string]: unknown;
}

export interface ToolContext {
	queue: GuildQueue | null;
	currentTrackTitle: string;
	currentTrackAuthor: string;
	trackCount: number;
	interaction: ChatInputCommandInteraction;
	voiceChannel: VoiceBasedChannel;
}

interface ToolMessages {
	pending: () => string;
	success: (result: ToolResult) => string;
}

interface ToolDefinition {
	createTool: (context: ToolContext) => Tool;
	messages: ToolMessages;
	requiresQueue?: boolean;
	isReadOnly?: boolean;
}

function requireQueue(context: ToolContext): GuildQueue {
	const { queue } = context;
	if (!queue) throw new Error('Queue is required but not available');
	return queue;
}

const TOOL_REGISTRY: Record<string, ToolDefinition> = {
	getQueueStatus: {
		requiresQueue: true,
		isReadOnly: true,
		createTool: (context: ToolContext) =>
			tool({
				description:
					'Get the current queue status including now playing track, total track count, and playback state (paused, volume)',
				inputSchema: z.object({}),
				execute: async () => {
					const queue = requireQueue(context);
					const currentTrack = queue.currentTrack;

					return {
						success: true,
						currentTrack: currentTrack
							? {
									title: currentTrack.title,
									author: currentTrack.author,
									duration: currentTrack.duration,
								}
							: null,
						trackCount: queue.tracks.size,
						isPaused: queue.node.isPaused(),
						volume: queue.node.volume,
					};
				},
			}),
		messages: {
			pending: () => 'Reading queue status…',
			success: () => 'Read queue status',
		},
	},
	listTracks: {
		requiresQueue: true,
		isReadOnly: true,
		createTool: (context: ToolContext) =>
			tool({
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
				execute: async ({ offset = 0, limit = 25 }) => {
					const tracks = requireQueue(context).tracks.toArray();
					const slice = tracks.slice(offset, offset + limit);

					return {
						success: true,
						tracks: slice.map((track, index) => ({
							index: offset + index,
							title: track.title,
							author: track.author,
							duration: track.duration,
						})),
						total: tracks.length,
						hasMore: offset + limit < tracks.length,
					};
				},
			}),
		messages: {
			pending: () => 'Listing tracks…',
			success: () => 'Listed tracks',
		},
	},
	removeTracksByPattern: {
		requiresQueue: true,
		createTool: (context: ToolContext) =>
			tool({
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
				execute: async ({ artistPattern, titlePattern }) => {
					return removeTracksByPattern(
						requireQueue(context),
						artistPattern ?? undefined,
						titlePattern ?? undefined,
					);
				},
			}),
		messages: {
			pending: () => 'Removing tracks…',
			success: (result) => {
				const count = result.removedCount ?? 0;
				return pluralizeTracks`Removed ${count} ${null}`;
			},
		},
	},
	moveTracksByPattern: {
		requiresQueue: true,
		createTool: (context: ToolContext) =>
			tool({
				description:
					'Move all tracks matching a pattern to a specific position in the queue. After moving tracks to the front, use skipCurrentTrack to play them immediately.',
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
						.describe(
							'Target position (0 = front of queue, -1 = end of queue)',
						),
				}),
				execute: async ({ artistPattern, titlePattern, position }) => {
					return moveTracksByPattern(
						requireQueue(context),
						artistPattern ?? undefined,
						titlePattern ?? undefined,
						position,
					);
				},
			}),
		messages: {
			pending: () => 'Moving tracks…',
			success: (result) => {
				const count = result.movedCount ?? 0;
				return pluralizeTracks`Moved ${count} ${null} to front`;
			},
		},
	},
	skipCurrentTrack: {
		requiresQueue: true,
		createTool: (context: ToolContext) =>
			tool({
				description:
					'Skip the currently playing track to play the next track in queue',
				inputSchema: z.object({}),
				execute: async () => {
					return skipCurrentTrack(requireQueue(context));
				},
			}),
		messages: {
			pending: () => 'Skipping track…',
			success: () => 'Skipped current track',
		},
	},
	pausePlayback: {
		requiresQueue: true,
		createTool: (context: ToolContext) =>
			tool({
				description: 'Pause the currently playing track',
				inputSchema: z.object({}),
				execute: async () => {
					return pausePlayback(requireQueue(context));
				},
			}),
		messages: {
			pending: () => 'Pausing playback…',
			success: (result) => {
				if (result.wasPaused) {
					return 'Playback was already paused';
				}
				return 'Paused playback';
			},
		},
	},
	resumePlayback: {
		requiresQueue: true,
		createTool: (context: ToolContext) =>
			tool({
				description: 'Resume the paused track',
				inputSchema: z.object({}),
				execute: async () => {
					return resumePlayback(requireQueue(context));
				},
			}),
		messages: {
			pending: () => 'Resuming playback…',
			success: () => 'Resumed playback',
		},
	},
	setVolume: {
		requiresQueue: true,
		createTool: (context: ToolContext) =>
			tool({
				description:
					'Set the playback volume (0-100, where 100 is maximum volume)',
				inputSchema: z.object({
					volume: z.number().min(0).max(100).describe('Volume level (0-100)'),
				}),
				execute: async ({ volume }) => {
					return setVolume(requireQueue(context), volume);
				},
			}),
		messages: {
			pending: () => 'Setting volume…',
			success: (result) => {
				return `Set volume to ${result.volume}`;
			},
		},
	},
	deduplicateQueue: {
		requiresQueue: true,
		createTool: (context: ToolContext) =>
			tool({
				description: 'Remove duplicate tracks from the queue',
				inputSchema: z.object({}),
				execute: async () => {
					return deduplicateQueue(requireQueue(context));
				},
			}),
		messages: {
			pending: () => 'Removing duplicates…',
			success: (result) => {
				const count = result.removedCount ?? 0;
				if (count === 0) {
					return 'No duplicates found';
				}
				return pluralizeDuplicates`Removed ${count} ${null}`;
			},
		},
	},
	searchAndPlay: {
		createTool: (context: ToolContext) =>
			tool({
				description:
					'Search for a song and add it to the queue. Supports song names, artist names, YouTube URLs, and Spotify URLs.',
				inputSchema: z.object({
					query: z
						.string()
						.describe(
							'Search query – can be a song name, artist name, YouTube URL, or Spotify URL',
						),
				}),
				execute: async ({ query }) => {
					const player = useMainPlayer();

					try {
						const { track } = await player.play(context.voiceChannel, query, {
							searchEngine: determineSearchEngine(query),
							nodeOptions: {
								metadata: {
									interaction: context.interaction,
								} satisfies QueueMetadata,
								defaultFFmpegFilters: ['_normalizer' as keyof QueueFilters],
							},
							requestedBy: context.interaction.user,
						});

						return {
							success: true,
							trackTitle: track.title,
							trackAuthor: track.author,
						};
					} catch (error) {
						logger.error({ error, query }, '[Prompt] Search and play failed');
						return {
							success: false,
							error: 'No results found for the query',
						};
					}
				},
			}),
		messages: {
			pending: () => 'Searching and adding to queue…',
			success: (result) => {
				if (!result.success) return result.error ?? 'Failed to find track';
				return `Added "${result.trackTitle}" by ${result.trackAuthor}`;
			},
		},
	},
	listAvailablePlaylists: {
		isReadOnly: true,
		createTool: (context: ToolContext) =>
			tool({
				description:
					'List all available internal playlists that can be enqueued',
				inputSchema: z.object({}),
				execute: async () => {
					try {
						const playlistsChannel =
							context.interaction.client.channels.cache.get(
								getEnvironmentVariable('PLAYLISTS_CHANNEL_ID'),
							);

						if (!playlistsChannel?.isTextBased()) {
							return {
								success: false,
								playlists: [],
								error: 'Playlists channel not found',
							};
						}

						const messages = await playlistsChannel.messages.fetch({
							limit: 100,
							cache: false,
						});

						const playlistIds = messages
							.map(
								(message) => /id="(?<id>.+)"/.exec(message.content)?.groups?.id,
							)
							.filter((id): id is string => id !== undefined)
							.sort((a, b) =>
								a.localeCompare(b, 'en', { sensitivity: 'base' }),
							);

						return { success: true, playlists: playlistIds };
					} catch (error) {
						logger.error({ error }, '[Prompt] Failed to list playlists');
						return {
							success: false,
							playlists: [],
							error: 'Failed to fetch playlists',
						};
					}
				},
			}),
		messages: {
			pending: () => 'Listing available playlists…',
			success: () => 'Listed available playlists',
		},
	},
	enqueuePlaylist: {
		createTool: (context: ToolContext) =>
			tool({
				description:
					'Enqueue all songs from an internal playlist by its ID. Use listAvailablePlaylists first to discover available playlist IDs.',
				inputSchema: z.object({
					playlistId: z
						.string()
						.describe('The ID of the internal playlist to enqueue'),
				}),
				execute: async ({ playlistId }) => {
					try {
						const playlistsChannel =
							context.interaction.client.channels.cache.get(
								getEnvironmentVariable('PLAYLISTS_CHANNEL_ID'),
							);

						if (!playlistsChannel?.isTextBased()) {
							return {
								success: false,
								enqueuedCount: 0,
								totalCount: 0,
								error: 'Playlists channel not found',
							};
						}

						const messages = await playlistsChannel.messages.fetch({
							limit: 100,
							cache: false,
						});
						const playlistMessage = messages.find((message) =>
							message.content.includes(`id="${playlistId}"`),
						);

						if (!playlistMessage) {
							return {
								success: false,
								enqueuedCount: 0,
								totalCount: 0,
								error: `Playlist "${playlistId}" not found`,
							};
						}

						const content = cleanUpPlaylistContent(playlistMessage.content);
						const songs = content
							.split('\n')
							.filter((song) => song.trim() !== '');

						if (songs.length === 0) {
							return {
								success: false,
								enqueuedCount: 0,
								totalCount: 0,
								error: 'Playlist is empty',
							};
						}

						const player = useMainPlayer();
						let enqueuedCount = 0;

						for (const song of songs) {
							try {
								await player.play(context.voiceChannel, song, {
									searchEngine: determineSearchEngine(song),
									fallbackSearchEngine: 'youtubeSearch',
									nodeOptions: {
										metadata: {
											interaction: context.interaction,
										} satisfies QueueMetadata,
										defaultFFmpegFilters: ['_normalizer' as keyof QueueFilters],
									},
									requestedBy: context.interaction.user,
								});
								enqueuedCount++;
							} catch (error) {
								logger.error(
									{ error, song },
									'[Prompt] Failed to enqueue song from playlist',
								);
							}
						}

						void statsHandler.saveStat('playlist', {
							playlistId,
							requestedById: context.interaction.user.id,
						});

						return {
							success: true,
							enqueuedCount,
							totalCount: songs.length,
						};
					} catch (error) {
						logger.error({ error }, '[Prompt] Enqueue playlist failed');
						return {
							success: false,
							enqueuedCount: 0,
							totalCount: 0,
							error: 'Failed to enqueue playlist',
						};
					}
				},
			}),
		messages: {
			pending: () => 'Enqueueing playlist…',
			success: (result) => {
				if (!result.success)
					return result.error ?? 'Failed to enqueue playlist';
				const count = result.enqueuedCount ?? 0;
				const total = result.totalCount ?? 0;
				if (count === total) {
					return pluralizeTracks`Enqueued ${count} ${null} from playlist`;
				}
				return pluralizeTracks`Enqueued ${count}/${total} ${null} from playlist`;
			},
		},
	},
};

export function getAvailableTools(context: ToolContext): Record<string, Tool> {
	const tools: Record<string, Tool> = {};

	for (const [name, definition] of Object.entries(TOOL_REGISTRY)) {
		if (definition.requiresQueue && !context.queue) continue;
		tools[name] = definition.createTool(context);
	}

	return tools;
}

export function getToolMessages(toolName: string): ToolMessages | undefined {
	return TOOL_REGISTRY[toolName]?.messages;
}

export function isReadOnlyTool(toolName: string): boolean {
	return TOOL_REGISTRY[toolName]?.isReadOnly ?? false;
}

export function generatePendingMessage(toolName: string): string {
	const messages = getToolMessages(toolName);
	return messages?.pending() ?? `${toolName}…`;
}

export function generateSuccessMessage(
	toolName: string,
	result: ToolResult,
): string {
	const messages = getToolMessages(toolName);
	return messages?.success(result) ?? `${toolName} completed`;
}

export function formatToolArgs(
	input: Record<string, unknown>,
): string | undefined {
	const parts: string[] = [];

	for (const [key, value] of Object.entries(input)) {
		if (value == null) continue;
		parts.push(
			typeof value === 'string' ? `${key}: "${value}"` : `${key}: ${value}`,
		);
	}

	return parts.length > 0 ? parts.join(', ') : undefined;
}

export function generateSystemPrompt(context: ToolContext): string {
	const parts: string[] = [
		'You are a music bot assistant. You can inspect and control the music queue, search for songs, and enqueue internal playlists. If the user asks anything unrelated to music, respond with an error.',
	];

	if (context.queue) {
		parts.push(
			`Current queue has ${context.trackCount} tracks. Now playing: "${context.currentTrackTitle}" by ${context.currentTrackAuthor}.`,
			'For straightforward requests (skip, pause, resume, volume, remove/move by artist or title), act directly without reading the queue first.',
			'When the user says "next" or "play X next", move those tracks to front (position 0) and skip the current track.',
			'For inverse removal ("everything except X") or metadata-based filtering (e.g., by duration), use listTracks first to discover queue contents, then remove non-matching tracks individually by artist or title.',
			'Use listAvailablePlaylists to discover internal playlists before enqueueing.',
		);
	} else {
		parts.push(
			'The queue is currently empty. Use searchAndPlay to add songs or enqueuePlaylist to add an internal playlist. Use listAvailablePlaylists to discover available playlists.',
		);
	}

	return parts.join('\n\n');
}
