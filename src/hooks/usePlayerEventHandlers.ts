import type { Player } from 'discord-player';
import {
	ActionRowBuilder,
	ActivityType,
	ButtonBuilder,
	ButtonStyle,
	type Client,
} from 'discord.js';
import { DEFAULT_MESSAGE_COMPONENT_AWAIT_TIME_MS } from '../constants/miscellaneous';
import { QueueRecoveryService } from '../utils/QueueRecoveryService';
import { StatsHandler } from '../utils/StatsHandler';
import createTrackEmbed from '../utils/createTrackEmbed';
import deleteOpusCacheEntry from '../utils/deleteOpusCacheEntry';
import isObject from '../utils/isObject';
import { resetPresence, setPresence } from '../utils/presenceManager';

const statsHandler = StatsHandler.getInstance();
const queueRecoveryService = QueueRecoveryService.getInstance();

export default function usePlayerEventHandlers(
	client: Client,
	player: Player,
): void {
	player.events.on('playerStart', async (queue, track) => {
		const embed = createTrackEmbed(queue, track, 'Playing it now.');

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

		try {
			const answer = await response.awaitMessageComponent({
				time: DEFAULT_MESSAGE_COMPONENT_AWAIT_TIME_MS,
			});

			if (answer.customId === 'skip') {
				queue?.node.skip();

				return await answer.update({
					content: 'Track skipped.',
					embeds: [],
					components: [],
				});
			}

			throw 'fallthrough to catch block';
		} catch {
			await response.edit({
				components: [],
			});

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
