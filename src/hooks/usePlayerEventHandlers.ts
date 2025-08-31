import {
	ActionRowBuilder,
	ActivityType,
	ButtonBuilder,
	ButtonStyle,
	type Client,
} from 'discord.js';
import type { Player } from 'discord-player';
import createSmartInteractionHandler from '../utils/createSmartInteractionHandler';
import createTrackEmbed from '../utils/createTrackEmbed';
import deleteOpusCacheEntry from '../utils/deleteOpusCacheEntry';
import isObject from '../utils/isObject';
import { resetPresence, setPresence } from '../utils/presenceManager';
import { QueueRecoveryService } from '../utils/QueueRecoveryService';
import { StatsHandler } from '../utils/StatsHandler';

const statsHandler = StatsHandler.getInstance();
const queueRecoveryService = QueueRecoveryService.getInstance();

export default function usePlayerEventHandlers(
	client: Client,
	player: Player,
): void {
	player.events.on('playerStart', async (queue, track) => {
		const embed = await createTrackEmbed(track, 'Playing it now.');

		const skip = new ButtonBuilder()
			.setCustomId('skip')
			.setLabel('Skip')
			.setStyle(ButtonStyle.Danger);

		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(skip);

		const response = await queue.metadata.interaction.channel.send({
			embeds: [embed],
			components: [row],
		});

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
				queue?.node.skip();

				const skippedEmbed = await createTrackEmbed(
					track,
					'⏭️ Track was skipped.',
				);

				return await answer.update({
					content: 'Track skipped.',
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

		void deleteOpusCacheEntry(track.url);
	});
}
