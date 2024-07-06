import process from 'node:process';
import {
	ActivityType,
	Client,
	EmbedBuilder,
	Events,
	GatewayIntentBits,
} from 'discord.js';
import useAutocompleteHandler from './hooks/useAutocompleteHandler';
import useCommandHandlers from './hooks/useCommandHandlers';
import useDebugListeners from './hooks/useDebugListeners';
import usePlaylistModalSubmit from './hooks/usePlaylistModalSubmit';
import { StatsHandler } from './utils/StatsHandler';
import initializeCommands from './utils/initializeCommands';
import getInitializedPlayer from './utils/initializePlayer';
import logger from './utils/logger';
import resetStatus from './utils/resetStatus';

const statsHandler = StatsHandler.getInstance();

(async () => {
	await initializeCommands();

	const client = new Client({
		intents: [
			GatewayIntentBits.Guilds,
			GatewayIntentBits.GuildVoiceStates,
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

		await queue.metadata.channel.send({ embeds: [embed] });

		await statsHandler.saveStat('play', {
			title: track.title,
			author: track.author,
			requestedById: track.requestedBy?.id,
		});

		client.user?.setActivity(`"${track.title}" by ${track.author}`, {
			type: ActivityType.Streaming,
		});
	});

	player.events.on('emptyQueue', (queue) => {
		queue.metadata.reply('Queue finished.');
		resetStatus(client);
	});

	player.events.on('queueDelete', () => {
		resetStatus(client);
	});

	player.events.on('disconnect', () => {
		resetStatus(client);
	});

	client.on('ready', () => {
		logger.info(`Logged in as ${client.user?.tag}!`);

		client.user?.setActivity('Idle, use /play to get started', {
			type: ActivityType.Custom,
		});
	});

	client.on('interactionCreate', async (interaction) => {
		await useAutocompleteHandler(interaction);

		if (!interaction.isChatInputCommand()) return;

		await useCommandHandlers(interaction);
	});

	client.on(Events.InteractionCreate, async (interaction) => {
		if (!interaction.isModalSubmit()) return;

		await usePlaylistModalSubmit(interaction);
	});

	client.login(process.env.TOKEN);

	useDebugListeners();
})();
