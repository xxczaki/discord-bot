import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	type CacheType,
	type ChatInputCommandInteraction,
	type GuildMember,
	StringSelectMenuBuilder,
} from 'discord.js';
import enqueuePlaylists from '../utils/enqueuePlaylists';
import getEnvironmentVariable from '../utils/getEnvironmentVariable';
import getPlaylists from '../utils/getPlaylists';

export default async function playlistsCommandHandler(
	interaction: ChatInputCommandInteraction<CacheType>,
) {
	const channel = interaction.client.channels.cache.get(
		getEnvironmentVariable('PLAYLISTS_CHANNEL_ID'),
	);

	if (!channel?.isTextBased()) {
		return interaction.reply('Invalid playlists channel type!');
	}

	const voiceChannel = (interaction.member as GuildMember).voice.channel;

	if (!voiceChannel) {
		return interaction.reply({
			content: 'You are not connected to a voice channel!',
			components: [],
		});
	}

	const playlists = await getPlaylists(channel);

	const select = new StringSelectMenuBuilder()
		.setCustomId('playlistSelect')
		.setPlaceholder('Select up to 10 entries')
		.addOptions(...playlists)
		.setMinValues(1)
		.setMaxValues(10);

	const cancel = new ButtonBuilder()
		.setCustomId('cancel')
		.setLabel('Cancel')
		.setStyle(ButtonStyle.Secondary);

	const selects = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
		select,
	);
	const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(cancel);

	const response = await interaction.reply({
		content: 'Choose which playlists you want to enqueue:',
		components: [selects, buttons],
	});

	try {
		const answer = await response.awaitMessageComponent({
			time: 60_000, // 1 minute
		});

		if (answer.isStringSelectMenu()) {
			return await enqueuePlaylists(answer, voiceChannel);
		}

		if (answer.isButton()) {
			return await response.delete();
		}

		await answer.reply({
			content: 'No playlists were selected, aborting…',
			components: [],
		});
	} catch {
		await response.delete();
	}
}
