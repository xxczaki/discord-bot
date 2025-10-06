import { openai } from '@ai-sdk/openai';
import { generateText, tool } from 'ai';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { Track } from 'discord-player';
import { z } from 'zod';
import useQueueWithValidation from '../utils/useQueueWithValidation';

// Rate limiter: 100 calls per day for the entire bot
class RateLimiter {
	private static instance: RateLimiter;
	private callCount = 0;
	private lastReset = new Date();

	private constructor() {}

	static getInstance(): RateLimiter {
		if (!RateLimiter.instance) {
			RateLimiter.instance = new RateLimiter();
		}
		return RateLimiter.instance;
	}

	canMakeCall(): boolean {
		this.resetIfNeeded();
		return this.callCount < 100;
	}

	incrementCall(): void {
		this.resetIfNeeded();
		this.callCount++;
	}

	getRemainingCalls(): number {
		this.resetIfNeeded();
		return Math.max(0, 100 - this.callCount);
	}

	private resetIfNeeded(): void {
		const now = new Date();
		const hoursSinceReset =
			(now.getTime() - this.lastReset.getTime()) / (1000 * 60 * 60);

		if (hoursSinceReset >= 24) {
			this.callCount = 0;
			this.lastReset = now;
		}
	}
}

const rateLimiter = RateLimiter.getInstance();

export default async function promptCommandHandler(
	interaction: ChatInputCommandInteraction,
) {
	const apiKey = process.env.OPENAI_API_KEY;

	if (!apiKey) {
		return interaction.reply({
			content: 'The `/prompt` command is not available.',
			flags: ['Ephemeral'],
		});
	}

	const queue = useQueueWithValidation(
		interaction,
		'The queue is empty. Cannot process prompt.',
	);

	if (!queue) return;

	if (!rateLimiter.canMakeCall()) {
		return interaction.reply({
			content:
				'Daily rate limit reached (100 calls per day). Try again tomorrow.',
			flags: ['Ephemeral'],
		});
	}

	const prompt = interaction.options.getString('prompt', true);

	await interaction.reply('Processing your request…');

	try {
		const tracks = queue.tracks.toArray();
		const currentTrack = queue.currentTrack;

		// Prepare queue data for the AI
		const queueData = tracks.map((track, index) => ({
			index: index,
			title: track.title,
			author: track.author,
			url: track.url,
			duration: track.duration,
		}));

		const result = await generateText({
			model: openai('gpt-5-nano'),
			system: `You are a bot control assistant that helps manipulate a music queue. You can ONLY perform actions on the queue - you cannot answer general questions or chat with users. If the user asks anything that isn't about controlling the queue, respond with an error.

Current queue has ${tracks.length} tracks. The current playing track is: "${currentTrack?.title ?? 'None'}" by ${currentTrack?.author ?? 'N/A'}.

Available actions:
- Remove tracks matching criteria (e.g., by artist, title)
- Move tracks matching criteria to a specific position
- Skip the current track

Be precise with pattern matching. Use case-insensitive matching for artist/title names.`,
			prompt: `User request: "${prompt}"\n\nQueue data: ${JSON.stringify(queueData, null, 2)}`,
			tools: {
				removeTracksByPattern: tool({
					description:
						'Remove all tracks from the queue that match a pattern (artist name, title, or both)',
					inputSchema: z.object({
						artistPattern: z
							.string()
							.optional()
							.describe('Artist name pattern to match (case-insensitive)'),
						titlePattern: z
							.string()
							.optional()
							.describe('Track title pattern to match (case-insensitive)'),
					}),
					execute: async ({ artistPattern, titlePattern }) => {
						const tracksToRemove: Track[] = [];
						let shouldSkipCurrent = false;

						for (const track of tracks) {
							const matchesArtist = artistPattern
								? track.author
										.toLowerCase()
										.includes(artistPattern.toLowerCase())
								: true;
							const matchesTitle = titlePattern
								? track.title.toLowerCase().includes(titlePattern.toLowerCase())
								: true;

							if (matchesArtist && matchesTitle) {
								tracksToRemove.push(track);
							}
						}

						if (currentTrack) {
							const currentMatchesArtist = artistPattern
								? currentTrack.author
										.toLowerCase()
										.includes(artistPattern.toLowerCase())
								: true;
							const currentMatchesTitle = titlePattern
								? currentTrack.title
										.toLowerCase()
										.includes(titlePattern.toLowerCase())
								: true;

							if (currentMatchesArtist && currentMatchesTitle) {
								shouldSkipCurrent = true;
							}
						}

						for (const track of tracksToRemove) {
							queue.removeTrack(track);
						}

						if (shouldSkipCurrent) {
							queue.node.skip();
						}

						const totalRemoved =
							tracksToRemove.length + (shouldSkipCurrent ? 1 : 0);

						return {
							success: true,
							removedCount: totalRemoved,
						};
					},
				}),
				moveTracksByPattern: tool({
					description:
						'Move all tracks matching a pattern to a specific position in the queue',
					inputSchema: z.object({
						artistPattern: z
							.string()
							.optional()
							.describe('Artist name pattern to match (case-insensitive)'),
						titlePattern: z
							.string()
							.optional()
							.describe('Track title pattern to match (case-insensitive)'),
						position: z
							.number()
							.describe(
								'Target position (0 = front of queue, -1 = end of queue)',
							),
						skipCurrent: z
							.boolean()
							.optional()
							.describe(
								'Whether to skip the current track after moving (use this to play the moved tracks immediately)',
							),
					}),
					execute: async ({
						artistPattern,
						titlePattern,
						position,
						skipCurrent,
					}) => {
						const tracksToMove: { track: Track; originalIndex: number }[] = [];

						for (const [index, track] of tracks.entries()) {
							const matchesArtist = artistPattern
								? track.author
										.toLowerCase()
										.includes(artistPattern.toLowerCase())
								: true;
							const matchesTitle = titlePattern
								? track.title.toLowerCase().includes(titlePattern.toLowerCase())
								: true;

							if (matchesArtist && matchesTitle) {
								tracksToMove.push({ track, originalIndex: index });
							}
						}

						if (tracksToMove.length === 0) {
							throw new Error('No tracks found matching the criteria');
						}

						const targetPos = position === -1 ? tracks.length - 1 : position;

						if (position === 0 || position === -1) {
							for (let index = tracksToMove.length - 1; index >= 0; index--) {
								const { track } = tracksToMove[index];
								queue.moveTrack(track, targetPos);
							}
						} else {
							for (const { track } of tracksToMove) {
								queue.moveTrack(track, targetPos);
							}
						}

						if (skipCurrent) {
							queue.node.skip();
						}

						return {
							success: true,
							movedCount: tracksToMove.length,
							skippedCurrent: skipCurrent ?? false,
						};
					},
				}),
				skipCurrentTrack: tool({
					description:
						'Skip the currently playing track to play the next track in queue',
					inputSchema: z.object({}),
					execute: async () => {
						queue.node.skip();

						return {
							success: true,
						};
					},
				}),
			},
		});

		rateLimiter.incrementCall();

		const toolCalls = result.toolCalls || [];

		if (toolCalls.length === 0) {
			return interaction.editReply(
				'No actions were performed. The request might not match any tracks in the queue.',
			);
		}

		const steps = toolCalls
			.map((call) => {
				const input = call.input as Record<string, unknown>;
				const params = Object.entries(input)
					.filter(([_, value]) => value !== undefined && value !== null)
					.map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
					.join(', ');
				return `→ ${call.toolName}(${params})`;
			})
			.join('\n');

		await interaction.editReply(steps);
	} catch (error) {
		await interaction.editReply({
			content:
				error instanceof Error
					? error.message
					: 'An error occurred while processing your request.',
		});
	}
}
