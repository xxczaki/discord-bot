import './utils/instrument';

import { useQueue } from 'discord-player';
import {
	ActionRowBuilder,
	ActivityType,
	ButtonBuilder,
	ButtonStyle,
	Client,
	GatewayIntentBits,
	PresenceUpdateStatus,
} from 'discord.js';
import { DEFAULT_MESSAGE_COMPONENT_AWAIT_TIME_MS } from './constants/miscellaneous';
import useAutocompleteHandler from './hooks/useAutocompleteHandler';
import useCommandHandlers from './hooks/useCommandHandlers';
import useDebugListeners from './hooks/useDebugListeners';
import { QueueRecoveryService } from './utils/QueueRecoveryService';
import { StatsHandler } from './utils/StatsHandler';
import createTrackEmbed from './utils/createTrackEmbed';
import deleteOpusCacheEntry from './utils/deleteOpusCacheEntry';
import getCommitLink from './utils/getCommitLink';
import getEnvironmentVariable from './utils/getEnvironmentVariable';
import initializeCommands from './utils/initializeCommands';
import getInitializedPlayer from './utils/initializePlayer';
import isObject from './utils/isObject';
import logger from './utils/logger';
import resetPresence from './utils/resetPresence';

const statsHandler = StatsHandler.getInstance();
const queueRecoveryService = QueueRecoveryService.getInstance();

void initializeCommands();

const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildVoiceStates,
		GatewayIntentBits.GuildPresences,
		GatewayIntentBits.MessageContent,
	],
	presence: {
		activities: [
			{
				name: 'Idle, use /play to get started',
				type: ActivityType.Custom,
			},
		],
		status: PresenceUpdateStatus.Idle,
	},
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

await client.login(getEnvironmentVariable('TOKEN'));

const player = await getInitializedPlayer(client);

useDebugListeners(client);

client.on('interactionCreate', async (interaction) => {
	if (!interaction.guild) {
		throw new TypeError('Guild is not defined!');
	}

	const context = {
		guild: interaction.guild,
	};

	await player.context.provide(context, async () => {
		await useAutocompleteHandler(interaction);

		if (!interaction.isChatInputCommand()) return;

		await useCommandHandlers(interaction);
	});
});

client.on('voiceStateUpdate', async (oldState) => {
	const queue = useQueue(oldState.guild.id);

	void queueRecoveryService.saveQueue(queue);

	const track = queue?.currentTrack;

	if (!track) {
		return;
	}

	if (isObject(track.metadata) && track.metadata.isFromCache) {
		return;
	}

	await deleteOpusCacheEntry(track.url);
});

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
