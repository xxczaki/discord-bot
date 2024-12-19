import { addMilliseconds, formatDistance } from 'date-fns';
import {
	type GuildQueue,
	QueueRepeatMode,
	type Track,
	useQueue,
} from 'discord-player';
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	type CacheType,
	type ChatInputCommandInteraction,
	EmbedBuilder,
	type InteractionResponse,
	type Message,
} from 'discord.js';
import getTrackPosition from '../utils/getTrackPosition';

export default async function queueCommandHandler(
	interaction: ChatInputCommandInteraction<CacheType>,
) {
	const queue = useQueue(interaction.guild?.id ?? '');

	const tracks = queue?.tracks.toArray() ?? [];
	const currentTrack = queue?.currentTrack;

	if (!currentTrack) {
		return interaction.reply('The queue is empty and nothing is being played.');
	}

	await interaction.deferReply();

	let descriptionLength = 0;
	let currentDescriptionIndex = 0;
	let index = 0;
	const embedDescriptions: string[][] = [[]];

	for (const track of tracks) {
		if (descriptionLength > 1900) {
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

	const now = new Date();
	const afterQueueEnds = addMilliseconds(new Date(), queue.estimatedDuration);

	const trackEndsAt = afterQueueEnds.toLocaleTimeString('pl', {
		hour: '2-digit',
		minute: '2-digit',
	});

	const queueEmbed = new EmbedBuilder()
		.setTitle('Queue')
		.addFields([
			{
				name: 'Tracks',
				value: `${(queue?.size ?? 0) + 1}`,
				inline: true,
			},
			{
				name: 'Duration',
				value: !queue?.estimatedDuration
					? 'N/A'
					: `${formatDistance(now, afterQueueEnds)}`,
				inline: true,
			},
			{
				name: 'Ending time',
				value: !queue?.estimatedDuration ? 'N/A' : trackEndsAt,
				inline: true,
			},
		])
		.setDescription(
			`0. ▶️${queue.repeatMode === QueueRepeatMode.TRACK ? '🔁' : ''} "${currentTrack.title}" by ${currentTrack.author} (*${currentTrack.duration}*)\n${embedDescriptions[0].join('\n')}`,
		)
		.setFooter({
			text: !embedDescriptions.length
				? ''
				: `Page 1/${embedDescriptions.length} ${queue.repeatMode === QueueRepeatMode.QUEUE ? '· Repeat enabled 🔁' : ''}`,
		})
		.setThumbnail(currentTrack.thumbnail);

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
		currentTrack,
		queue,
		queueEmbed,
		embedDescriptions,
		previous,
		next,
	});
}

type ListenerProps = {
	currentTrack: Track;
	queue: GuildQueue;
	queueEmbed: EmbedBuilder;
	embedDescriptions: string[][];
	previous: ButtonBuilder;
	next: ButtonBuilder;
};

async function componentResponseListener(
	response: InteractionResponse<boolean> | Message<boolean>,
	properties: ListenerProps,
) {
	const { currentTrack, queue, queueEmbed, embedDescriptions, previous, next } =
		properties;

	try {
		const answer = await response.awaitMessageComponent({
			time: 60_000, // 1 minute
		});
		const pageNumber = Number.parseInt(answer.customId, 10);

		queueEmbed
			.setDescription(
				`0. ▶️${queue.repeatMode === QueueRepeatMode.TRACK ? '🔁' : ''} "${currentTrack.title}" by ${currentTrack.author} (*${currentTrack.duration}*)\n${embedDescriptions[pageNumber].join('\n')}`,
			)
			.setFooter({
				text: `Page ${pageNumber + 1}/${embedDescriptions.length} ${queue.repeatMode === QueueRepeatMode.QUEUE ? '· Repeat enabled 🔁' : ''}`,
			});

		const previousPage = pageNumber - 1;
		const nextPage = pageNumber + 1;

		previous.setCustomId(`${previousPage}`).setDisabled(previousPage < 0);
		next
			.setCustomId(`${nextPage}`)
			.setDisabled(nextPage + 1 > embedDescriptions.length);

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
