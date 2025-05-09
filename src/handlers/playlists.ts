import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	type ChatInputCommandInteraction,
	type GuildMember,
	StringSelectMenuBuilder,
} from 'discord.js';
import { DEFAULT_MESSAGE_COMPONENT_AWAIT_TIME_MS } from '../constants/miscellaneous';
import enqueuePlaylists from '../utils/enqueuePlaylists';
import getEnvironmentVariable from '../utils/getEnvironmentVariable';
import getPlaylists from '../utils/getPlaylists';

export default async function playlistsCommandHandler(
	interaction: ChatInputCommandInteraction,
) {
	const channel = interaction.client.channels.cache.get(
		getEnvironmentVariable('PLAYLISTS_CHANNEL_ID'),
	);

	if (!channel?.isTextBased()) {
		return interaction.reply({
			content: 'Invalid playlists channel type!',
			flags: ['Ephemeral'],
		});
	}

	const voiceChannel = (interaction.member as GuildMember).voice.channel;

	if (!voiceChannel) {
		return interaction.reply({
			content: 'You are not connected to a voice channel!',
			components: [],
			flags: ['Ephemeral'],
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
		flags: ['Ephemeral'],
	});

	const answer = await response.awaitMessageComponent({
		time: DEFAULT_MESSAGE_COMPONENT_AWAIT_TIME_MS,
	});

	if (answer.isButton()) {
		return response.delete();
	}

	if (answer.isStringSelectMenu()) {
		await response.delete();

		return enqueuePlaylists(answer, voiceChannel);
	}

	await response.delete();

	return answer.reply({
		content: 'No playlists were selected, aborting…',
		components: [],
		flags: ['Ephemeral'],
	});
}
