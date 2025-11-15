import { type Tool, tool } from 'ai';
import type { GuildQueue } from 'discord-player';
import { z } from 'zod';
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

const pluralizeTracks = pluralize('track', 'tracks');
const pluralizeDuplicates = pluralize('duplicate', 'duplicates');

export interface ToolResult {
	success?: boolean;
	removedCount?: number;
	movedCount?: number;
	skippedCurrent?: boolean;
	wasPaused?: boolean;
	volume?: number;
	error?: string;
	[key: string]: unknown;
}

/**
 * Tool configuration for the AI prompt system
 */
export interface ToolContext {
	queue: GuildQueue;
	currentTrackTitle: string;
	currentTrackAuthor: string;
	trackCount: number;
}

interface ToolMessages {
	pending: () => string;
	success: (result: ToolResult) => string;
	error?: (result: ToolResult) => string;
}

interface ToolDefinition {
	createTool: (context: ToolContext) => Tool;
	messages: ToolMessages;
}

/**
 * Execute removeTracksByPattern operation
 */
export function executeRemoveTracksByPattern(
	queue: GuildQueue,
	artistPattern?: string | null,
	titlePattern?: string | null,
) {
	try {
		return removeTracksByPattern(
			queue,
			artistPattern ?? undefined,
			titlePattern ?? undefined,
		);
	} catch (error) {
		logger.error(
			{
				error: error instanceof Error ? error.message : String(error),
				artistPattern,
				titlePattern,
			},
			'[PromptTool] removeTracksByPattern failed',
		);
		throw error;
	}
}

/**
 * Execute moveTracksByPattern operation
 */
export function executeMoveTracksByPattern(
	queue: GuildQueue,
	artistPattern: string | null | undefined,
	titlePattern: string | null | undefined,
	position: number,
) {
	try {
		return moveTracksByPattern(
			queue,
			artistPattern ?? undefined,
			titlePattern ?? undefined,
			position,
		);
	} catch (error) {
		logger.error(
			{
				error: error instanceof Error ? error.message : String(error),
				artistPattern,
				titlePattern,
				position,
			},
			'[PromptTool] moveTracksByPattern failed',
		);
		throw error;
	}
}

/**
 * Execute skipCurrentTrack operation
 */
export function executeSkipCurrentTrack(queue: GuildQueue) {
	try {
		return skipCurrentTrack(queue);
	} catch (error) {
		logger.error(
			{
				error: error instanceof Error ? error.message : String(error),
			},
			'[PromptTool] skipCurrentTrack failed',
		);
		throw error;
	}
}

/**
 * Execute pausePlayback operation
 */
export function executePausePlayback(queue: GuildQueue) {
	try {
		return pausePlayback(queue);
	} catch (error) {
		logger.error(
			{
				error: error instanceof Error ? error.message : String(error),
			},
			'[PromptTool] pausePlayback failed',
		);
		throw error;
	}
}

/**
 * Execute resumePlayback operation
 */
export function executeResumePlayback(queue: GuildQueue) {
	try {
		return resumePlayback(queue);
	} catch (error) {
		logger.error(
			{
				error: error instanceof Error ? error.message : String(error),
			},
			'[PromptTool] resumePlayback failed',
		);
		throw error;
	}
}

/**
 * Execute setVolume operation
 */
export function executeSetVolume(queue: GuildQueue, volume: number) {
	try {
		return setVolume(queue, volume);
	} catch (error) {
		logger.error(
			{
				error: error instanceof Error ? error.message : String(error),
				volume,
			},
			'[PromptTool] setVolume failed',
		);
		throw error;
	}
}

/**
 * Execute deduplicateQueue operation
 */
export function executeDeduplicateQueue(queue: GuildQueue) {
	try {
		return deduplicateQueue(queue);
	} catch (error) {
		logger.error(
			{
				error: error instanceof Error ? error.message : String(error),
			},
			'[PromptTool] deduplicateQueue failed',
		);
		throw error;
	}
}

/**
 * Unified registry of tools with their definitions and UI messages
 */
const TOOL_REGISTRY: Record<string, ToolDefinition> = {
	removeTracksByPattern: {
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
					return executeRemoveTracksByPattern(
						context.queue,
						artistPattern,
						titlePattern,
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
					return executeMoveTracksByPattern(
						context.queue,
						artistPattern,
						titlePattern,
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
		createTool: (context: ToolContext) =>
			tool({
				description:
					'Skip the currently playing track to play the next track in queue',
				inputSchema: z.object({}),
				execute: async () => {
					return executeSkipCurrentTrack(context.queue);
				},
			}),
		messages: {
			pending: () => 'Skipping track…',
			success: () => 'Skipped current track',
		},
	},
	pausePlayback: {
		createTool: (context: ToolContext) =>
			tool({
				description: 'Pause the currently playing track',
				inputSchema: z.object({}),
				execute: async () => {
					return executePausePlayback(context.queue);
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
		createTool: (context: ToolContext) =>
			tool({
				description: 'Resume the paused track',
				inputSchema: z.object({}),
				execute: async () => {
					return executeResumePlayback(context.queue);
				},
			}),
		messages: {
			pending: () => 'Resuming playback…',
			success: () => 'Resumed playback',
		},
	},
	setVolume: {
		createTool: (context: ToolContext) =>
			tool({
				description:
					'Set the playback volume (0-100, where 100 is maximum volume)',
				inputSchema: z.object({
					volume: z.number().min(0).max(100).describe('Volume level (0-100)'),
				}),
				execute: async ({ volume }) => {
					return executeSetVolume(context.queue, volume);
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
		createTool: (context: ToolContext) =>
			tool({
				description: 'Remove duplicate tracks from the queue',
				inputSchema: z.object({}),
				execute: async () => {
					return executeDeduplicateQueue(context.queue);
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
};

/**
 * Get all available tools for the given context
 */
export function getAvailableTools(context: ToolContext): Record<string, Tool> {
	const tools: Record<string, Tool> = {};

	for (const [name, definition] of Object.entries(TOOL_REGISTRY)) {
		tools[name] = definition.createTool(context);
	}

	return tools;
}

/**
 * Get message generators for a tool
 */
export function getToolMessages(toolName: string): ToolMessages | undefined {
	return TOOL_REGISTRY[toolName]?.messages;
}

/**
 * Generate pending message for a tool
 */
export function generatePendingMessage(toolName: string): string {
	const messages = getToolMessages(toolName);
	return messages?.pending() ?? `${toolName}…`;
}

/**
 * Generate success message for a tool execution result
 */
export function generateSuccessMessage(
	toolName: string,
	result: ToolResult,
): string {
	const messages = getToolMessages(toolName);
	return messages?.success(result) ?? `${toolName} completed`;
}

/**
 * Generate error message for a tool execution failure
 */
export function generateErrorMessage(
	toolName: string,
	result: ToolResult,
): string {
	const messages = getToolMessages(toolName);

	if (messages?.error) {
		return messages.error(result);
	}

	// Default error message
	if (typeof result === 'object' && result !== null && 'error' in result) {
		return `Failed: ${result.error}`;
	}

	return 'Operation failed';
}

/**
 * Generate system prompt for the AI
 */
export function generateSystemPrompt(context: ToolContext): string {
	return `You are a bot control assistant that helps manipulate a music queue. You can ONLY perform actions on the queue - you cannot answer general questions or chat with users. If the user asks anything that isn't about controlling the queue, respond with an error.

Current queue has ${context.trackCount} tracks. The current playing track is: "${context.currentTrackTitle}" by ${context.currentTrackAuthor}.

Available actions:
- Remove tracks matching criteria (e.g., by artist, title)
- Move tracks matching criteria to a specific position
- Skip the current track
- Pause playback
- Resume playback
- Set volume (0-100)
- Remove duplicate tracks from queue

Be precise with pattern matching. Use case-insensitive matching for artist/title names.`;
}
