import { stat } from 'node:fs/promises';
import {
	ActionRowBuilder,
	ActivityType,
	ButtonBuilder,
	ButtonStyle,
	type Client,
	type InteractionResponse,
	type Message,
} from 'discord.js';
import type { Player, Track } from 'discord-player';
import prettyBytes from 'pretty-bytes';
import createSmartInteractionHandler from '../utils/createSmartInteractionHandler';
import createTrackEmbed from '../utils/createTrackEmbed';
import isObject from '../utils/isObject';
import { OpusCacheManager } from '../utils/OpusCacheManager';
import { resetPresence, setPresence } from '../utils/presenceManager';
import { QueueRecoveryService } from '../utils/QueueRecoveryService';
import { StatsHandler } from '../utils/StatsHandler';

const FINISH_DELAY_MS = 1000;

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
		const embed = await createTrackEmbed(track, 'Playing it now.');

		const skip = new ButtonBuilder()
			.setCustomId('skip')
			.setLabel('Skip')
			.setStyle(ButtonStyle.Danger);

		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(skip);

		const guildId = queue.guild?.id;
		const response = await queue.metadata.interaction.channel.send({
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

				return await answer.update({
					content: null,
					embeds: [skippedEmbed],
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

		await new Promise((resolve) => setTimeout(resolve, FINISH_DELAY_MS));

		const finishedEmbed = await createTrackEmbed(track, '✅ Finished playing.');

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
				const filename = opusCacheManager.generateFilename({
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
		await queue.metadata.interaction.channel.send('Queue finished, leaving…');

		void queueRecoveryService.deleteQueue();

		resetPresence(client);
	});

	player.events.on('queueDelete', async () => {
		resetPresence(client);
	});

	player.events.on('playerSkip', async (_queue, track) => {
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
