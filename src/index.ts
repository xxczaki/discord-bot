import('./utils/sentry');

import {
	type ButtonBuilder,
	Client,
	Events,
	GatewayIntentBits,
	type TextBasedChannel,
} from 'discord.js';
import useDebugListeners from './hooks/useDebugListeners';
import { StatsHandler } from './utils/StatsHandler';
import getEnvironmentVariable from './utils/getEnvironmentVariable';
import initializeCommands from './utils/initializeCommands';
import getInitializedPlayer from './utils/initializePlayer';

const statsHandler = StatsHandler.getInstance();

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
		const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } =
			await import('discord.js');

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

		const response = await (queue.metadata.channel as TextBasedChannel).send({
			embeds: [embed],
			components: [row],
		});

		try {
			const answer = await response.awaitMessageComponent({
				time: 60_000, // 1 minute
			});

			if (answer.customId === 'skip') {
				queue?.node.skip();

				await answer.update({
					content: 'Track skipped.',
					embeds: [],
					components: [],
				});
			}
		} catch {
			await response.edit({
				components: [],
			});
		}

		await statsHandler.saveStat('play', {
			title: track.title,
			author: track.author,
			requestedById: track.requestedBy?.id,
		});

		const { ActivityType, PresenceUpdateStatus } = await import('discord.js');

		client.user?.setPresence({
			activities: [
				{
					name: `"${track.title}" by ${track.author}`,
					type: ActivityType.Listening,
				},
			],
			status: PresenceUpdateStatus.Online,
		});
	});

	player.events.on('emptyQueue', async (queue) => {
		queue.metadata.reply('Queue finished.');

		const { default: resetStatus } = await import('./utils/resetStatus');

		resetStatus(client);
	});

	player.events.on('queueDelete', async () => {
		const { default: resetStatus } = await import('./utils/resetStatus');

		resetStatus(client);
	});

	player.events.on('disconnect', async () => {
		const { default: resetStatus } = await import('./utils/resetStatus');

		resetStatus(client);
	});

	client.on('ready', async () => {
		const [{ default: logger }, { default: resetStatus }, { BOT_CHANNEL_ID }] =
			await Promise.all([
				import('./utils/logger'),
				import('./utils/resetStatus'),
				import('./constants/channelIds'),
			]);

		logger.info(`Logged in as ${client.user?.tag}!`);

		resetStatus(client);

		const channel = client.channels.cache.get(BOT_CHANNEL_ID);

		if (channel?.isTextBased()) {
			const commitHash = process.env.GIT_COMMIT;
			const wasDeploymentManual = !commitHash;

			const commitLink = `[\`${commitHash}\`](<https://github.com/xxczaki/discord-bot/commit/${commitHash}>)`;

			channel.send({
				content: `ℹ️ Update successful, ready to play.\n\nDeployment source: ${wasDeploymentManual ? '`manual`' : commitLink}`,
			});
		}
	});

	client.on('interactionCreate', async (interaction) => {
		const { default: useAutocompleteHandler } = await import(
			'./hooks/useAutocompleteHandler'
		);

		await useAutocompleteHandler(interaction);

		if (!interaction.isChatInputCommand()) return;

		const { default: useCommandHandlers } = await import(
			'./hooks/useCommandHandlers'
		);

		await useCommandHandlers(interaction);
	});

	client.on(Events.InteractionCreate, async (interaction) => {
		if (!interaction.isModalSubmit()) return;

		const { default: usePlaylistModalSubmit } = await import(
			'./hooks/usePlaylistModalSubmit'
		);

		await usePlaylistModalSubmit(interaction);
	});

	client.login(getEnvironmentVariable('TOKEN'));

	useDebugListeners(client);
})();
