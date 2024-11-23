import('./utils/sentry');

import { Util } from 'discord-player';
import {
	ActionRowBuilder,
	ActivityType,
	ButtonBuilder,
	ButtonStyle,
	Client,
	EmbedBuilder,
	GatewayIntentBits,
	PresenceUpdateStatus,
} from 'discord.js';
import { BOT_CHANNEL_ID } from './constants/channelIds';
import useAutocompleteHandler from './hooks/useAutocompleteHandler';
import useCommandHandlers from './hooks/useCommandHandlers';
import useDebugListeners from './hooks/useDebugListeners';
import { QueueRecoveryService } from './utils/QueueRecoveryService';
import { StatsHandler } from './utils/StatsHandler';
import getEnvironmentVariable from './utils/getEnvironmentVariable';
import getReleaseDetails from './utils/getReleaseDetails';
import initializeCommands from './utils/initializeCommands';
import getInitializedPlayer from './utils/initializePlayer';
import logger from './utils/logger';
import resetPresence from './utils/resetPresence';
import saveQueue from './utils/saveQueue';

const statsHandler = StatsHandler.getInstance();
const queueRecoveryService = QueueRecoveryService.getInstance();

(async () => {
	await initializeCommands();

	const client = new Client({
		intents: [
			GatewayIntentBits.Guilds,
			GatewayIntentBits.GuildVoiceStates,
			GatewayIntentBits.GuildPresences,
			GatewayIntentBits.MessageContent,
		],
	});

	const player = await getInitializedPlayer(client);

	player.events.on('playerStart', async (queue, track) => {
		const embed = new EmbedBuilder()
			.setTitle(track.title)
			.setDescription('Playing it now.')
			.setURL(track.url)
			.setAuthor({ name: track.author })
			.setThumbnail(track.thumbnail)
			.addFields(
				{ name: 'Duration', value: track.duration, inline: true },
				{ name: 'Source', value: track.source, inline: true },
			);

		const skip = new ButtonBuilder()
			.setCustomId('skip')
			.setLabel('Skip')
			.setStyle(ButtonStyle.Danger);

		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(skip);

		const response = await queue.metadata.channel.send({
			embeds: [embed],
			components: [row],
		});

		client.user?.setPresence({
			activities: [
				{
					name: `"${track.title}" by ${track.author}`,
					type: ActivityType.Listening,
					url: track.url,
				},
			],
			status: PresenceUpdateStatus.Online,
		});

		try {
			const answer = await response.awaitMessageComponent({
				time: 60_000, // 1 minute
			});

			if (answer.customId === 'skip') {
				queue?.node.skip();

				return answer.update({
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

			await statsHandler.saveStat('play', {
				title: track.title,
				author: track.author,
				requestedById: track.requestedBy?.id,
			});
		}
	});

	player.events.on('emptyQueue', async (queue) => {
		await queue.metadata.channel.send('Queue finished, leaving…');

		await queueRecoveryService.deleteQueue();

		resetPresence(client);
	});

	player.events.on('queueDelete', async () => {
		resetPresence(client);
	});

	player.events.on('voiceStateUpdate', async (queue) => {
		await saveQueue(queue);

		if (!queue.channel) {
			return;
		}

		if (Util.isVoiceEmpty(queue.channel)) {
			queue.delete();
		}
	});

	client.on('ready', async () => {
		logger.info(`Logged in as ${client.user?.tag}!`);

		const channel = client.channels.cache.get(BOT_CHANNEL_ID);

		if (channel?.isSendable()) {
			channel.send({
				content: `ℹ️ Deployment successful, ready to play.\n\nSource: ${getReleaseDetails()}.`,
			});
		}
	});

	client.on('interactionCreate', async (interaction) => {
		await useAutocompleteHandler(interaction);

		if (!interaction.isChatInputCommand()) return;

		await useCommandHandlers(interaction);
	});

	await client.login(getEnvironmentVariable('TOKEN'));

	resetPresence(client);

	useDebugListeners(client);
})();
