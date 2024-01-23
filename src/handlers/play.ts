import { useMainPlayer, useQueue } from 'discord-player';
import type { GuildMember } from 'discord.js';
import {
	type ChatInputCommandInteraction,
	type CacheType,
	EmbedBuilder,
} from 'discord.js';
import getTrackPosition from '../utils/getTrackPosition';

export default async function playCommandHandler(
	interaction: ChatInputCommandInteraction<CacheType>,
) {
	const channel = (interaction.member as GuildMember).voice.channel;

	if (!channel) {
		await interaction.reply({
			content: 'You are not connected to a voice channel!',
			ephemeral: true,
		});
		return;
	}

	const query = interaction.options.getString('query', true);

	try {
		const player = useMainPlayer();
		const queue = useQueue(interaction.guild?.id ?? '');

		await interaction.deferReply();

		const { track } = await player.play(channel, query, {
			nodeOptions: {
				metadata: interaction,
			},
			requestedBy: interaction.user.id,
		});

		const embed = new EmbedBuilder()
			.setTitle(track.title)
			.setDescription(
				`Added to queue (position №${getTrackPosition(queue, track)}).`,
			)
			.setURL(track.url)
			.setAuthor({ name: track.author })
			.setThumbnail(track.thumbnail)
			.addFields(
				{ name: 'Duration', value: track.duration, inline: true },
				{ name: 'Source', value: track.source, inline: true },
			);

		await interaction.followUp({ embeds: [embed] });
	} catch (error) {
		await interaction.reply(`Something went wrong: ${error}.`);
	}
}
