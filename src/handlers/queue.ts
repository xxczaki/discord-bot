import { useQueue } from 'discord-player';
import type { CacheType, ChatInputCommandInteraction } from 'discord.js';

export default async function queueCommandHandler(
	interaction: ChatInputCommandInteraction<CacheType>,
) {
	const queue = useQueue(interaction.guild?.id ?? '');

	const tracks = queue?.tracks.toArray() ?? [];
	const currentTrack = queue?.currentTrack;

	if (!currentTrack && tracks.length === 0) {
		await interaction.editReply(
			'The queue is empty and nothing is being played.',
		);
		return;
	}

	let descriptionLength = 0;
	let currentDescriptionIndex = 0;
	let index = 0;
	const embedDescriptions: string[][] = [[]];

	const { default: getTrackPosition } = await import(
		'../utils/getTrackPosition'
	);

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
		await interaction.editReply(
			`Invalid page number provided; it should be within range: [1, ${embedDescriptions.length}].`,
		);
		return;
	}

	const [{ EmbedBuilder }, { QueueRepeatMode }, { addMilliseconds }] =
		await Promise.all([
			import('discord.js'),
			import('discord-player'),
			import('date-fns/addMilliseconds'),
		]);

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

	await interaction.editReply({ embeds: [queueEmbed] });
}
