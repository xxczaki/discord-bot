import {
	addMilliseconds,
	differenceInCalendarDays,
	formatDistance,
} from 'date-fns';
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	type ChatInputCommandInteraction,
	EmbedBuilder,
	type InteractionResponse,
	type Message,
} from 'discord.js';
import { type GuildQueue, QueueRepeatMode, type Track } from 'discord-player';
import createQueueAwareComponentHandler from '../utils/createQueueAwareComponentHandler';
import getTrackPosition from '../utils/getTrackPosition';
import getTrackThumbnail from '../utils/getTrackThumbnail';
import isObject from '../utils/isObject';
import useQueueWithValidation from '../utils/useQueueWithValidation';

export default async function queueCommandHandler(
	interaction: ChatInputCommandInteraction,
) {
	const queue = useQueueWithValidation(
		interaction,
		'The queue is empty and nothing is being played.',
	);

	if (!queue) return;

	const tracks = queue.tracks.toArray();
	const currentTrack = queue.currentTrack;

	if (!currentTrack) {
		return interaction.reply('The queue is empty and nothing is being played.');
	}

	await interaction.reply('Fetching the queue…');

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
			currentDescriptionIndex === 0 ? position : position + 2
		}. "${track.title}" by ${track.author} (*${track.duration}*)`;

		descriptionLength += entry.length;
		embedDescriptions[currentDescriptionIndex][index] = entry;
		index++;
	}

	const now = new Date();
	const afterQueueEnds = addMilliseconds(new Date(), queue.estimatedDuration);
	const dayDifference = differenceInCalendarDays(afterQueueEnds, now);

	const trackEndsAt = afterQueueEnds.toLocaleTimeString('pl', {
		hour: '2-digit',
		minute: '2-digit',
	});

	const endingTime =
		dayDifference === 0 ? trackEndsAt : `${trackEndsAt} (+${dayDifference})`;

	const isCached =
		isObject(currentTrack.metadata) &&
		(currentTrack.metadata.isFromCache as boolean);

	const queueEmbed = new EmbedBuilder()
		.setTitle('Queue')
		.setColor('Blue')
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
				name: 'Ending Time',
				value: !queue?.estimatedDuration ? 'N/A' : endingTime,
				inline: true,
			},
		])
		.setDescription(
			`0. ${queue.node.isPaused() ? '⏸️' : '▶️'}${queue.repeatMode === QueueRepeatMode.TRACK ? '🔁' : ''}${isCached ? '♻️' : ''} "${currentTrack.title}" by ${currentTrack.author} (*${currentTrack.duration}*)\n${embedDescriptions[0].join('\n')}`,
		)
		.setThumbnail(getTrackThumbnail(currentTrack));

	// Only set footer if there are tracks in the queue
	if (embedDescriptions[0].length > 0) {
		queueEmbed.setFooter({
			text: `Page 1/${embedDescriptions.length} ${queue.repeatMode === QueueRepeatMode.QUEUE ? '· Repeat enabled 🔁' : ''}`,
		});
	}

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
		content: null,
	});

	const handler = createQueueAwareComponentHandler({
		response,
		queue,
	});

	await componentResponseListener(response, {
		currentTrack,
		isCached,
		queue,
		queueEmbed,
		embedDescriptions,
		previous,
		next,
		handler,
	});
}

type ListenerProps = {
	currentTrack: Track;
	isCached: boolean;
	queue: GuildQueue;
	queueEmbed: EmbedBuilder;
	embedDescriptions: string[][];
	previous: ButtonBuilder;
	next: ButtonBuilder;
	handler: ReturnType<typeof createQueueAwareComponentHandler>;
};

async function componentResponseListener(
	response: InteractionResponse<boolean> | Message<boolean>,
	properties: ListenerProps,
) {
	const {
		currentTrack,
		isCached,
		queue,
		queueEmbed,
		embedDescriptions,
		previous,
		next,
		handler,
	} = properties;

	try {
		const answer = await response.awaitMessageComponent({
			time: handler.timeout,
		});
		const pageNumber = Number.parseInt(answer.customId, 10);

		const initialTrackInfo = `0. ${queue.node.isPaused() ? '⏸️' : '▶️'}${queue.repeatMode === QueueRepeatMode.TRACK ? '🔁' : ''}${isCached ? '♻️' : ''} "${currentTrack.title}" by ${currentTrack.author} (*${currentTrack.duration}*)`;

		queueEmbed
			.setDescription(
				`${pageNumber === 0 ? initialTrackInfo : ''}\n${embedDescriptions[pageNumber].join('\n')}`,
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
		await handler.cleanup();
	}
}
