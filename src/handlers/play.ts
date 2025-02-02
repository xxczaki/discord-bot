import { createWriteStream, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	QueryType,
	type QueueFilters,
	useMainPlayer,
	useQueue,
} from 'discord-player';
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	type GuildMember,
} from 'discord.js';
import type { CacheType, ChatInputCommandInteraction } from 'discord.js';
import createTrackEmbed from '../utils/createTrackEmbed';
import determineSearchEngine from '../utils/determineSearchEngine';
import getTrackPosition from '../utils/getTrackPosition';
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

	const fileName = Buffer.from(query).toString('base64url');
	const filePath = join(tmpdir(), `${fileName}.pcm`);
	const isCached = existsSync(filePath);

	try {
		const player = useMainPlayer();

		const interceptor = player.createStreamInterceptor({
			async shouldIntercept() {
				return true;
			},
		});

		const unsubscribe = interceptor.onStream(
			async (_queue, _track, _format, stream) => {
				const out = createWriteStream(filePath);

				stream.interceptors.add(out);
			},
		);

		const { track } = await player.play(channel, isCached ? filePath : query, {
			searchEngine: isCached ? QueryType.FILE : determineSearchEngine(query),
			nodeOptions: {
				metadata: interaction,
				defaultFFmpegFilters: ['_normalizer' as keyof QueueFilters],
				enableStreamInterceptor: !isCached,
			},
			requestedBy: interaction.user.id,
		});

		unsubscribe();

		const queue = useQueue();

		const trackPosition = getTrackPosition(queue, track) + 1;

		const embed = createTrackEmbed(
			track,
			`Added to queue (position ${trackPosition}).`,
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
