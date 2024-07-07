import type { QueueFilters } from 'discord-player';
import type { ButtonBuilder, GuildMember } from 'discord.js';
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

		const [
			{ EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder },
			{ default: getTrackPosition },
		] = await Promise.all([
			import('discord.js'),
			import('../utils/getTrackPosition'),
		]);

		const trackPosition = getTrackPosition(queue, track) + 1;

		const embed = new EmbedBuilder()
			.setTitle(track.title)
			.setDescription(`Added to queue (position ${trackPosition}).`)
			.setURL(track.url)
			.setAuthor({ name: track.author })
			.setThumbnail(track.thumbnail)
			.addFields(
				{ name: 'Duration', value: track.duration, inline: true },
				{ name: 'Source', value: track.source, inline: true },
			);

		const moveFirst = new ButtonBuilder()
			.setCustomId('move-first')
			.setLabel('Make it play next')
			.setStyle(ButtonStyle.Secondary);

		const remove = new ButtonBuilder()
			.setCustomId('remove')
			.setLabel('Remove')
			.setStyle(ButtonStyle.Danger);

		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
			moveFirst,
			remove,
		);

		const response = await interaction.editReply({
			embeds: [embed],
			components: [row],
		});

		try {
			const answer = await response.awaitMessageComponent({
				time: 60_000, // 1 minute
			});

			switch (answer.customId) {
				case 'move-first':
					queue?.moveTrack(trackPosition, 1);

					await answer.update({
						content: 'Moved to the beginning of the queue.',
						components: [],
					});
					break;
				case 'remove':
					queue?.removeTrack(trackPosition);

					await answer.update({
						content: 'Track removed from the queue.',
						embeds: [],
						components: [],
					});
					break;
			}
		} catch (e) {
			await interaction.editReply({
				components: [],
			});
		}
	} catch (error) {
		await interaction.editReply(`Something went wrong: ${error}.`);
	}
}
