import type {
	CacheType,
	ChatInputCommandInteraction,
	StringSelectMenuBuilder,
} from 'discord.js';
import { PLAYLISTS_CHANNEL_ID } from '../constants/channelIds';

export default async function playlistCommandHandler(
	interaction: ChatInputCommandInteraction<CacheType>,
) {
	const channel = interaction.client.channels.cache.get(PLAYLISTS_CHANNEL_ID);

	if (!channel?.isTextBased()) {
		return interaction.editReply('Invalid playlists channel type!');
	}

	const [
		{ useQueue },
		{
			StringSelectMenuBuilder,
			TextInputBuilder,
			TextInputStyle,
			ActionRowBuilder,
		},
		{ default: getPlaylists },
		{ default: enqueuePlaylists },
	] = await Promise.all([
		import('discord-player'),
		import('discord.js'),
		import('../utils/getPlaylists'),
		import('../utils/enqueuePlaylists'),
	]);

	const queue = useQueue(interaction.guild?.id ?? '');

	queue?.filters.ffmpeg.setInputArgs(['-threads', '4']);

	const playlists = await getPlaylists(channel);

	const select = new StringSelectMenuBuilder()
		.setCustomId('playlistSelect')
		.setPlaceholder('Select 1-5 entries')
		.addOptions(...playlists)
		.setMinValues(1)
		.setMaxValues(5);

	const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
		select,
	);

	const response = await interaction.editReply({
		content: 'Select which playlists you want to enqueue:',
		components: [row],
	});

	try {
		const answer = await response.awaitMessageComponent({
			time: 60_000, // 1 minute
		});

		if (answer.isStringSelectMenu()) {
			return enqueuePlaylists(answer);
		}

		await answer.update({
			content: 'No playlists were selected, aborting…',
			components: [],
		});
	} catch {
		await response.edit({
			components: [],
		});
	}
}
