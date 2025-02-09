import { Util } from 'discord-player';
import {
	ActionRowBuilder,
	ActivityType,
	ButtonBuilder,
	ButtonStyle,
	Client,
	GatewayIntentBits,
	PresenceUpdateStatus,
} from 'discord.js';
import useAutocompleteHandler from './hooks/useAutocompleteHandler';
import useCommandHandlers from './hooks/useCommandHandlers';
import useDebugListeners from './hooks/useDebugListeners';
import { QueueRecoveryService } from './utils/QueueRecoveryService';
import { StatsHandler } from './utils/StatsHandler';
import createTrackEmbed from './utils/createTrackEmbed';
import getCommitLink from './utils/getCommitLink';
import getEnvironmentVariable from './utils/getEnvironmentVariable';
import initializeCommands from './utils/initializeCommands';
import getInitializedPlayer from './utils/initializePlayer';
import logger from './utils/logger';
import resetPresence from './utils/resetPresence';

const statsHandler = StatsHandler.getInstance();
const queueRecoveryService = QueueRecoveryService.getInstance();

// Exporting only to silence an esbuild warning
export default (async () => {
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
		const embed = createTrackEmbed(track, 'Playing it now.');

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

		await queueRecoveryService.saveQueue(queue);

		try {
			const answer = await response.awaitMessageComponent({
				time: 60_000, // 1 minute
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
		await queueRecoveryService.saveQueue(queue);

		if (!queue.channel) {
			return;
		}

		if (Util.isVoiceEmpty(queue.channel)) {
			queue.delete();
		}
	});

	client.on('ready', async () => {
		logger.info(`Logged in as ${client.user?.tag}!`);

		const channel = client.channels.cache.get(
			getEnvironmentVariable('BOT_DEBUG_CHANNEL_ID'),
		);
		const commitHash = process.env.GIT_COMMIT_SHA;
		const wasDeploymentManual = !commitHash;

		if (channel?.isSendable() && !wasDeploymentManual) {
			await channel.send(
				`🎶 Ready to play, running commit ${getCommitLink(commitHash)}.`,
			);
		}
	});

	client.on('interactionCreate', async (interaction) => {
		if (!interaction.guild) {
			throw new TypeError('Guild is not defined!');
		}

		const context = {
			guild: interaction.guild,
		};

		player.context.provide(context, async () => {
			await useAutocompleteHandler(interaction);

			if (!interaction.isChatInputCommand()) return;

			await useCommandHandlers(interaction);
		});
	});

	await client.login(getEnvironmentVariable('TOKEN'));

	resetPresence(client);

	if (process.env.NODE_ENV !== 'development') {
		useDebugListeners(client);
	}
})();
