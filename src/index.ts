import('./utils/sentry');

import { Client, Events, GatewayIntentBits } from 'discord.js';
import useDebugListeners from './hooks/useDebugListeners';
import { StatsHandler } from './utils/StatsHandler';
import initializeCommands from './utils/initializeCommands';
import getInitializedPlayer from './utils/initializePlayer';

const statsHandler = StatsHandler.getInstance();

useDebugListeners();

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
		const { EmbedBuilder } = await import('discord.js');

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

		await queue.metadata.channel.send({ embeds: [embed] });

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
					type: ActivityType.Streaming,
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
		const [{ default: logger }, { default: resetStatus }] = await Promise.all([
			import('./utils/logger'),
			import('./utils/resetStatus'),
		]);

		logger.info(`Logged in as ${client.user?.tag}!`);

		resetStatus(client);
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

	client.login(process.env.TOKEN);
})();
