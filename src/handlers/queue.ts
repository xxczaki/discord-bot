import { useQueue } from 'discord-player';
import type {
	ButtonBuilder,
	CacheType,
	ChatInputCommandInteraction,
	EmbedBuilder,
	InteractionResponse,
	Message,
} from 'discord.js';

export default async function queueCommandHandler(
	interaction: ChatInputCommandInteraction<CacheType>,
) {
	const queue = useQueue(interaction.guild?.id ?? '');

	const tracks = queue?.tracks.toArray() ?? [];
	const currentTrack = queue?.currentTrack;

	if (!currentTrack && tracks.length === 0) {
		return interaction.editReply(
			'The queue is empty and nothing is being played.',
		);
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

	const [
		{ EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder },
		{ QueueRepeatMode },
		{ addMilliseconds },
	] = await Promise.all([
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
				name: 'Currently playing',
				// value: queue?.node.createProgressBar() ?? '',
				value: !currentTrack
					? '*nothing*'
					: `"${currentTrack.title}" by ${currentTrack.author} (*${currentTrack.duration}*)`,
			},
		])
		.setDescription(embedDescriptions[0].join('\n') || null)
		.setFooter({
			text: !embedDescriptions.length
				? ''
				: `Page 1/${embedDescriptions.length}`,
		});

	const previous = new ButtonBuilder()
		.setCustomId('0')
		.setLabel('Previous page')
		.setStyle(ButtonStyle.Secondary)
		.setDisabled(true);
	const next = new ButtonBuilder()
		.setCustomId('1')
		.setLabel('Next page')
		.setStyle(ButtonStyle.Secondary)
		.setDisabled(embedDescriptions.length === 1);

	const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
		previous,
		next,
	);

	const response = await interaction.editReply({
		embeds: [queueEmbed],
		components: [row],
	});

	await componentResponseListener(response, {
		queueEmbed,
		embedDescriptions,
		previous,
		next,
	});
}

type ListenerProps = {
	queueEmbed: EmbedBuilder;
	embedDescriptions: string[][];
	previous: ButtonBuilder;
	next: ButtonBuilder;
};

async function componentResponseListener(
	response: InteractionResponse<boolean> | Message<boolean>,
	properties: ListenerProps,
) {
	const { queueEmbed, embedDescriptions, previous, next } = properties;

	try {
		const answer = await response.awaitMessageComponent({
			time: 60_000, // 1 minute
		});
		const pageNumber = Number.parseInt(answer.customId, 10);

		queueEmbed
			.setDescription(embedDescriptions[pageNumber].join('\n') || null)
			.setFooter({
				text: `Page ${pageNumber + 1}/${embedDescriptions.length}`,
			});

		const previousPage = pageNumber - 1;
		const nextPage = pageNumber + 1;

		previous.setCustomId(`${previousPage}`).setDisabled(previousPage < 0);
		next
			.setCustomId(`${nextPage}`)
			.setDisabled(nextPage + 1 > embedDescriptions.length);

		const { ActionRowBuilder } = await import('discord.js');

		const updatedRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
			previous,
			next,
		);

		const nextResponse = await answer.update({
			embeds: [queueEmbed],
			components: [updatedRow],
		});

		await componentResponseListener(nextResponse, properties);
	} catch {
		await response.edit({
			components: [],
		});
	}
}
