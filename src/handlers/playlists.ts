import { useQueue } from 'discord-player';
import {
	ActionRowBuilder,
	type CacheType,
	type ChatInputCommandInteraction,
	type GuildMember,
	StringSelectMenuBuilder,
} from 'discord.js';
import { PLAYLISTS_CHANNEL_ID } from '../constants/channelIds';
import enqueuePlaylists from '../utils/enqueuePlaylists';
import getPlaylists from '../utils/getPlaylists';

export default async function playlistsCommandHandler(
	interaction: ChatInputCommandInteraction<CacheType>,
) {
	const channel = interaction.client.channels.cache.get(PLAYLISTS_CHANNEL_ID);

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

	const queue = useQueue(interaction.guild?.id ?? '');

	queue?.filters.ffmpeg.setInputArgs(['-threads', '4']);

	const playlists = await getPlaylists(channel);

	const select = new StringSelectMenuBuilder()
		.setCustomId('playlistSelect')
		.setPlaceholder('Select up to 10 entries')
		.addOptions(...playlists)
		.setMinValues(1)
		.setMaxValues(10);

	const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
		select,
	);

	const response = await interaction.reply({
		content: 'Choose which playlists you want to enqueue:',
		components: [row],
	});

	try {
		const answer = await response.awaitMessageComponent({
			time: 60_000, // 1 minute
		});

		await answer.deferUpdate();

		if (answer.isStringSelectMenu()) {
			return enqueuePlaylists(answer);
		}

		await answer.editReply({
			content: 'No playlists were selected, aborting…',
			components: [],
		});
	} catch {
		await response.delete();
	}
}
