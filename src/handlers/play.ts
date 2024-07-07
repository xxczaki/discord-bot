import type { QueueFilters } from 'discord-player';
import type { GuildMember } from 'discord.js';
import type { CacheType, ChatInputCommandInteraction } from 'discord.js';

export default async function playCommandHandler(
	interaction: ChatInputCommandInteraction<CacheType>,
) {
	const channel = (interaction.member as GuildMember).voice.channel;

	if (!channel) {
		await interaction.editReply('You are not connected to a voice channel!');
		return;
	}

	const query = interaction.options.getString('query', true);

	try {
		const { useMainPlayer, useQueue } = await import('discord-player');

		const player = useMainPlayer();
		const queue = useQueue(interaction.guild?.id ?? '');

		queue?.filters.ffmpeg.setInputArgs(['-threads', '4']);

		const { track } = await player.play(channel, query, {
			nodeOptions: {
				metadata: interaction,
				defaultFFmpegFilters: ['normalize' as keyof QueueFilters],
			},
			requestedBy: interaction.user.id,
		});

		const [{ EmbedBuilder }, { default: getTrackPosition }] = await Promise.all(
			[import('discord.js'), import('../utils/getTrackPosition')],
		);

		const embed = new EmbedBuilder()
			.setTitle(track.title)
			.setDescription(
				`Added to queue (position ${getTrackPosition(queue, track) + 1}).`,
			)
			.setURL(track.url)
			.setAuthor({ name: track.author })
			.setThumbnail(track.thumbnail)
			.addFields(
				{ name: 'Duration', value: track.duration, inline: true },
				{ name: 'Source', value: track.source, inline: true },
			);

		await interaction.editReply({ embeds: [embed] });
	} catch (error) {
		await interaction.editReply(`Something went wrong: ${error}.`);
	}
}
