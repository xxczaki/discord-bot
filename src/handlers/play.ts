import { captureException } from '@sentry/node';
import type { ChatInputCommandInteraction } from 'discord.js';
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	type GuildMember,
} from 'discord.js';
import { type QueueFilters, useMainPlayer, useQueue } from 'discord-player';
import createSmartInteractionHandler from '../utils/createSmartInteractionHandler';
import createTrackEmbed from '../utils/createTrackEmbed';
import determineSearchEngine from '../utils/determineSearchEngine';
import getTrackPosition from '../utils/getTrackPosition';
import logger from '../utils/logger';

export default async function playCommandHandler(
	interaction: ChatInputCommandInteraction,
) {
	const channel = (interaction.member as GuildMember).voice.channel;

	if (!channel) {
		return interaction.reply({
			content: 'You are not connected to a voice channel!',
			flags: ['Ephemeral'],
		});
	}

	await interaction.reply('Processing the track to play…');

	const query = interaction.options.getString('query', true);

	try {
		const player = useMainPlayer();

		const { track } = await player.play(channel, query, {
			searchEngine: determineSearchEngine(query),
			nodeOptions: {
				metadata: { interaction },
				defaultFFmpegFilters: ['_normalizer' as keyof QueueFilters],
			},
			requestedBy: interaction.user,
		});

		const queue = useQueue();

		if (!queue) {
			return interaction.editReply('The queue is empty.');
		}

		const trackPosition = getTrackPosition(queue, track) + 1;

		const embed = await createTrackEmbed(
			queue,
			track,
			`Added to queue (position ${trackPosition}).`,
		);

		const isInQueue = queue.tracks.some(({ id }) => id === track.id);

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
			content: null,
		});

		const smartHandler = createSmartInteractionHandler({
			response,
			queue,
			track,
		});

		try {
			const answer = await response.awaitMessageComponent({
				time: smartHandler.timeout,
			});

			await smartHandler.cleanup();

			switch (answer.customId) {
				case 'play-now':
					queue.moveTrack(track, 0);
					queue.node.skip();

					await answer.update({
						content: 'Playing this track now.',
						components: [],
					});
					break;
				case 'move-first':
					queue.moveTrack(track, 0);

					await answer.update({
						content: 'Moved to the beginning of the queue.',
						components: [],
					});
					break;
				case 'remove':
					queue.removeTrack(track);

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
		} catch {}
	} catch (error) {
		if (error instanceof Error && error.name.includes('No results found')) {
			return interaction.editReply('No results found for the given query.');
		}

		logger.error(error);
		captureException(error);
	}
}
