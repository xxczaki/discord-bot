import { type QueueFilters, useMainPlayer, useQueue } from 'discord-player';
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	type GuildMember,
} from 'discord.js';
import type { CacheType, ChatInputCommandInteraction } from 'discord.js';
import getTrackPosition from '../utils/getTrackPosition';
import isYouTubeLink from '../utils/isYouTubeLink';
import logger from '../utils/logger';

export default async function playCommandHandler(
	interaction: ChatInputCommandInteraction<CacheType>,
) {
	const channel = (interaction.member as GuildMember).voice.channel;

	if (!channel) {
		return interaction.reply('You are not connected to a voice channel!');
	}

	await interaction.deferReply();

	const query = interaction.options.getString('query', true);

	try {
		const player = useMainPlayer();
		const queue = useQueue(interaction.guild?.id ?? '');

		queue?.filters.ffmpeg.setInputArgs(['-threads', '4']);

		const { track } = await player.play(channel, query, {
			searchEngine: isYouTubeLink(query) ? 'youtubeVideo' : 'spotifySong',
			nodeOptions: {
				metadata: interaction,
				defaultFFmpegFilters: ['normalize' as keyof QueueFilters],
			},
			requestedBy: interaction.user.id,
		});

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

		const isInQueue = queue?.tracks.some(({ id }) => id === track.id);

		const playNow = new ButtonBuilder()
			.setCustomId('play-now')
			.setLabel('Play now')
			.setStyle(ButtonStyle.Success)
			.setDisabled(!isInQueue);

		const moveFirst = new ButtonBuilder()
			.setCustomId('move-first')
			.setLabel('Play next')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(trackPosition <= 1);

		const remove = new ButtonBuilder()
			.setCustomId('remove')
			.setLabel('Remove')
			.setStyle(ButtonStyle.Danger)
			.setDisabled(!isInQueue);

		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
			playNow,
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
				case 'play-now':
					queue?.moveTrack(track, 0);
					queue?.node.skip();

					await answer.update({
						content: 'Playing this track now.',
						components: [],
					});
					break;
				case 'move-first':
					queue?.moveTrack(track, 0);

					await answer.update({
						content: 'Moved to the beginning of the queue.',
						components: [],
					});
					break;
				case 'remove':
					queue?.removeTrack(track);

					await answer.update({
						content: 'Track removed from the queue.',
						embeds: [],
						components: [],
					});
					break;
				default:
					await answer.update({
						components: [],
					});
			}
		} catch {
			await interaction.editReply({
				components: [],
			});
		}
	} catch (error) {
		if (error instanceof Error && error.name.includes('ERR_NO_RESULT')) {
			return interaction.editReply('No results found for the given query.');
		}

		logger.error(error);
	}
}
