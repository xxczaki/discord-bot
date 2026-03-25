import { stat } from 'node:fs/promises';
import {
	ActionRowBuilder,
	ActivityType,
	ButtonBuilder,
	ButtonStyle,
	type Client,
	EmbedBuilder,
	type InteractionResponse,
	type Message,
} from 'discord.js';
import { type Player, type Track, TrackSkipReason } from 'discord-player';
import prettyBytes from 'pretty-bytes';
import { DEFAULT_MESSAGE_COMPONENT_AWAIT_TIME_MS } from '../constants/miscellaneous';
import type { QueueMetadata } from '../types/QueueMetadata';
import createSmartInteractionHandler from '../utils/createSmartInteractionHandler';
import createTrackEmbed from '../utils/createTrackEmbed';
import isObject from '../utils/isObject';
import { OpusCacheManager } from '../utils/OpusCacheManager';
import { resetPresence, setPresence } from '../utils/presenceManager';
import { QueueRecoveryService } from '../utils/QueueRecoveryService';
import { StatsHandler } from '../utils/StatsHandler';

const statsHandler = StatsHandler.getInstance();
const queueRecoveryService = QueueRecoveryService.getInstance();

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

		const embed = await createTrackEmbed(track, 'Playing it now.');

		const skip = new ButtonBuilder()
			.setCustomId('skip')
			.setLabel('Skip')
			.setStyle(ButtonStyle.Danger);

		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(skip);

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
