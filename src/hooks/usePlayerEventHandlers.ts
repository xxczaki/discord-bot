import { stat } from 'node:fs/promises';
import {
	ActionRowBuilder,
	ActivityType,
	ButtonBuilder,
	ButtonStyle,
	type Client,
	ComponentType,
	EmbedBuilder,
	type InteractionResponse,
	type Message,
	StringSelectMenuBuilder,
} from 'discord.js';
import {
	type Player,
	serialize,
	type Track,
	TrackSkipReason,
} from 'discord-player';
import prettyBytes from 'pretty-bytes';
import { DEFAULT_MESSAGE_COMPONENT_AWAIT_TIME_MS } from '../constants/miscellaneous';
import { FALLBACK_SEARCH_ENGINE } from '../constants/sourceConfig';
import type { QueueMetadata } from '../types/QueueMetadata';
import createSmartInteractionHandler from '../utils/createSmartInteractionHandler';
import createTrackEmbed from '../utils/createTrackEmbed';
import determineSearchEngine from '../utils/determineSearchEngine';
import isObject from '../utils/isObject';
import { OpusCacheManager } from '../utils/OpusCacheManager';
import { resetPresence, setPresence } from '../utils/presenceManager';
import { QueueRecoveryService } from '../utils/QueueRecoveryService';
import { RedisQueryCache } from '../utils/RedisQueryCache';
import redis from '../utils/redis';
import { StatsHandler } from '../utils/StatsHandler';

const statsHandler = StatsHandler.getInstance();
const queueRecoveryService = QueueRecoveryService.getInstance();
const queryCache = new RedisQueryCache(redis);

interface NowPlayingEntry {
	response: InteractionResponse<boolean> | Message<boolean>;
	track: Track;
}

export default function usePlayerEventHandlers(
	client: Client,
	player: Player,
): void {
	const nowPlayingMessages = new Map<string, NowPlayingEntry>();

	player.events.on('playerStart', async (queue, track) => {
		const { interaction } = queue.metadata as QueueMetadata;
		const channel = interaction.channel;

		if (!channel?.isSendable()) {
			return;
		}

		const originalQuery =
			isObject(track.metadata) &&
			typeof track.metadata.originalQuery === 'string'
				? track.metadata.originalQuery
				: null;

		const canCorrect =
			originalQuery !== null &&
			determineSearchEngine(originalQuery) !== 'youtubeVideo';

		const isCorrected =
			canCorrect && (await queryCache.isQueryCorrected(originalQuery));

		const embed = await createTrackEmbed(track, 'Playing it now.');

		if (isCorrected) {
			embed.setFooter({ text: '🔒 Resolution locked' });
		}

		const skip = new ButtonBuilder()
			.setCustomId('skip')
			.setLabel('Skip')
			.setStyle(ButtonStyle.Danger);

		const buttons: ButtonBuilder[] = [skip];

		if (canCorrect) {
			if (isCorrected) {
				buttons.push(
					new ButtonBuilder()
						.setCustomId('refetch')
						.setLabel('Refetch')
						.setStyle(ButtonStyle.Secondary),
				);
			} else {
				buttons.push(
					new ButtonBuilder()
						.setCustomId('correct')
						.setLabel('Correct')
						.setStyle(ButtonStyle.Secondary),
				);
			}
		}

		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons);

		const guildId = queue.guild?.id;
		const response = await channel.send({
			embeds: [embed],
			components: [row],
		});

		if (guildId) {
			nowPlayingMessages.set(guildId, { response, track });
		}

		setPresence(client, {
			name: `"${track.title}" by ${track.author}`,
			type: ActivityType.Listening,
			url: track.url,
			status: 'online',
		});

		void queueRecoveryService.saveQueue(queue);

		const smartHandler = createSmartInteractionHandler({
			response,
			queue,
			track,
		});

		try {
			const answer = await response.awaitMessageComponent({
				time: smartHandler.timeout,
			});

			await smartHandler.cleanup();

			if (answer.customId === 'skip') {
				if (guildId) {
					nowPlayingMessages.delete(guildId);
				}

				queue?.node.skip();

				const skippedEmbed = await createTrackEmbed(
					track,
					'⏭️ Track was skipped.',
				);

				const undoSkip = new ButtonBuilder()
					.setCustomId('undo-skip')
					.setLabel('Undo')
					.setStyle(ButtonStyle.Secondary);

				const undoRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
					undoSkip,
				);

				await answer.update({
					content: null,
					embeds: [skippedEmbed],
					components: [undoRow],
				});

				try {
					await channel.sendTyping();
				} catch {}

				try {
					const undoAnswer = await response.awaitMessageComponent({
						time: DEFAULT_MESSAGE_COMPONENT_AWAIT_TIME_MS,
					});

					if (undoAnswer.customId === 'undo-skip') {
						await queue.history.previous(true);

						const undoneEmbed = await createTrackEmbed(
							track,
							'↩️ Skip was undone.',
						);

						await undoAnswer.update({
							content: null,
							embeds: [undoneEmbed],
							components: [],
						});

						try {
							await channel.sendTyping();
						} catch {}
					}
				} catch {
					try {
						await response.edit({ components: [] });
					} catch {}
				}

				return;
			}

			if (answer.customId === 'correct' && originalQuery) {
				await answer.deferUpdate();

				const searchResults = await player.search(originalQuery, {
					searchEngine: FALLBACK_SEARCH_ENGINE,
				});

				const candidates = searchResults.tracks
					.filter((candidate) => candidate.url.length <= 100)
					.slice(0, 25);

				if (candidates.length === 0) {
					await response.edit({
						content: 'No results found for this query.',
						components: [],
					});
				} else {
					const selectMenu = new StringSelectMenuBuilder()
						.setCustomId('resolution-select')
						.setPlaceholder('Select the correct version');

					for (const candidate of candidates) {
						const label = `"${candidate.title}" by ${candidate.author}`.slice(
							0,
							100,
						);
						const isPlaying = candidate.url === track.url;

						selectMenu.addOptions({
							label,
							description:
								`${candidate.duration}${isPlaying ? ' (currently playing)' : ''}`.slice(
									0,
									100,
								),
							value: candidate.url.slice(0, 100),
						});
					}

					const selectRow =
						new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
							selectMenu,
						);

					await response.edit({
						components: [selectRow],
					});

					try {
						const selection = await response.awaitMessageComponent({
							time: DEFAULT_MESSAGE_COMPONENT_AWAIT_TIME_MS,
							componentType: ComponentType.StringSelect,
						});

						const selectedUrl = selection.values[0];

						const selectedTrack = candidates.find(
							(candidate) => candidate.url === selectedUrl,
						);

						if (selectedTrack) {
							await queryCache.setCorrectResolutionFromData(
								originalQuery,
								JSON.stringify(serialize(selectedTrack)),
							);
						}

						if (selectedUrl !== track.url && queue.channel) {
							const result = await player.play(queue.channel, selectedUrl, {
								searchEngine: determineSearchEngine(selectedUrl),
								requestedBy: track.requestedBy ?? undefined,
							});
							queue.moveTrack(result.track, 0);
							queue.node.skip();
						}

						const trackTitle = selectedTrack?.title ?? 'this track';

						await selection.update({
							content: `"${trackTitle}" will now always resolve for "${originalQuery}"`,
							embeds: [],
							components: [],
						});
					} catch {
						try {
							await response.edit({ components: [] });
						} catch {}
					}
				}
			}

			if (answer.customId === 'refetch' && originalQuery) {
				await queryCache.removeCorrectResolution(originalQuery);

				const updatedEmbed = await createTrackEmbed(track, 'Playing it now.');

				await answer.update({
					embeds: [updatedEmbed],
					components: [],
				});
			}

			throw 'fallthrough to catch block';
		} catch {
			void statsHandler.saveStat('play', {
				title: track.title,
				author: track.author,
				requestedById: track.requestedBy?.id,
			});
		}
	});

	player.events.on('playerFinish', async (queue, track) => {
		const guildId = queue.guild?.id;

		if (!guildId) {
			return;
		}

		const entry = nowPlayingMessages.get(guildId);

		if (!entry || entry.track.id !== track.id) {
			return;
		}

		nowPlayingMessages.delete(guildId);

		const hadStreamError =
			isObject(track.metadata) && 'streamError' in track.metadata;

		const finishedEmbed = await createTrackEmbed(
			track,
			hadStreamError ? 'Could not stream this track.' : '✅ Finished playing.',
		);

		if (hadStreamError) {
			finishedEmbed.setColor('Orange');
		}

		try {
			const opusCacheManager = OpusCacheManager.getInstance();

			if (isObject(track.metadata) && track.metadata.isFromCache) {
				const filename =
					typeof track.metadata.cacheFilename === 'string'
						? track.metadata.cacheFilename
						: opusCacheManager.generateFilename({
								title: track.cleanTitle,
								author: track.author,
								durationMS: track.durationMS,
							});
				const filePath = opusCacheManager.getFilePath(filename);
				const stats = await stat(filePath);

				finishedEmbed.setFooter({
					text: `♻️ Was streamed from the offline cache (${prettyBytes(stats.size)})`,
				});
			} else {
				const filename =
					isObject(track.metadata) &&
					typeof track.metadata.cacheFilename === 'string'
						? track.metadata.cacheFilename
						: opusCacheManager.generateFilename({
								title: track.cleanTitle,
								author: track.author,
								durationMS: track.durationMS,
							});
				const filePath = opusCacheManager.getFilePath(filename);
				const stats = await stat(filePath);

				if (stats.size > 0) {
					finishedEmbed.setFooter({
						text: `💾 Saved to the offline cache (${prettyBytes(stats.size)})`,
					});
				}
			}
		} catch {}

		try {
			await entry.response.edit({
				embeds: [finishedEmbed],
				components: [],
			});
		} catch {}
	});

	player.events.on('emptyQueue', async (queue) => {
		const { interaction } = queue.metadata as QueueMetadata;

		if (interaction.channel?.isSendable()) {
			await interaction.channel.send('Queue finished, leaving…');
		}

		void queueRecoveryService.deleteQueue();

		resetPresence(client);
	});

	player.events.on('queueDelete', async () => {
		resetPresence(client);
	});

	player.events.on('playerSkip', async (queue, track, reason) => {
		if (reason === TrackSkipReason.NoStream) {
			const { interaction } = queue.metadata as QueueMetadata;

			const embed = new EmbedBuilder()
				.setTitle('Track Skipped')
				.setDescription(
					`Could not stream **${track.title}** by ${track.author}. Skipping to the next track.`,
				)
				.setColor('Orange');

			try {
				if (interaction.channel?.isSendable()) {
					await interaction.channel.send({ embeds: [embed] });
				}
			} catch {}
		}

		if (isObject(track.metadata) && track.metadata.isFromCache) {
			return;
		}

		const opusCacheManager = OpusCacheManager.getInstance();
		const filename = opusCacheManager.generateFilename({
			title: track.cleanTitle,
			author: track.author,
			durationMS: track.durationMS,
		});

		void opusCacheManager.deleteEntry(filename);
	});
}
