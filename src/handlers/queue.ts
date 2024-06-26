import { addMilliseconds } from 'date-fns/addMilliseconds';
import { QueueRepeatMode, useQueue } from 'discord-player';
import {
	type CacheType,
	type ChatInputCommandInteraction,
	EmbedBuilder,
} from 'discord.js';
import getTrackPosition from '../utils/getTrackPosition';

export default async function queueCommandHandler(
	interaction: ChatInputCommandInteraction<CacheType>,
) {
	const queue = useQueue(interaction.guild?.id ?? '');

	const tracks = queue?.tracks.toArray() ?? [];
	const currentTrack = queue?.currentTrack;

	if (!currentTrack && tracks.length === 0) {
		await interaction.reply('The queue is empty and nothing is being played.');
		return;
	}

	let descriptionLength = 0;
	let currentDescriptionIndex = 0;
	let index = 0;
	const embedDescriptions: string[][] = [[]];

	for (const track of tracks) {
		if (descriptionLength > 2000) {
			descriptionLength = 0;
			embedDescriptions.push([]);
			currentDescriptionIndex++;
		}

		const position = getTrackPosition(queue, track);
		const entry = `${
			currentDescriptionIndex === 0 ? position : position + 1
		}. "${track.title}" by ${track.author} (*${track.duration}*)`;

		descriptionLength += entry.length;
		embedDescriptions[currentDescriptionIndex][index] = entry;
		index++;
	}

	const pageNumber = Math.abs(
		(interaction.options.getInteger('page_number') || 1) - 1,
	);

	if (pageNumber > embedDescriptions.length - 1) {
		await interaction.reply({
			content: `Invalid page number provided; it should be within range: [1, ${embedDescriptions.length}].`,
			ephemeral: true,
		});
		return;
	}

	const queueEmbed = new EmbedBuilder()
		.setTitle('Queue')
		.addFields([
			{
				name: 'State',
				value: queue?.node.isPaused() ? '⚠️ paused' : 'playing',
				inline: true,
			},
			{
				name: 'Loop mode',
				value: `\`${QueueRepeatMode[queue?.repeatMode ?? 0]}\``,
				inline: true,
			},
			{
				name: 'Number of tracks',
				value: `${queue?.size ?? '*unknown*'}`,
				inline: true,
			},
			{
				name: 'Total duration',
				value: !queue?.estimatedDuration
					? '0:00'
					: `${queue.durationFormatted} (will end at \`${addMilliseconds(
							new Date(),
							queue.estimatedDuration,
						).toLocaleTimeString('pl')}\`)`,
			},
			{
				name: !currentTrack
					? '*nothing*'
					: `"${currentTrack.title}" by ${currentTrack.author}`,
				value: queue?.node.createProgressBar() ?? '',
			},
		])
		.setDescription(embedDescriptions[pageNumber].join('\n') || null)
		.setFooter({
			text: !embedDescriptions.length
				? ''
				: `Page ${pageNumber + 1}/${embedDescriptions.length}`,
		});

	await interaction.reply({ embeds: [queueEmbed] });
}
