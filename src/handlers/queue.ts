import { addMilliseconds, formatDistance } from 'date-fns';
import { type GuildQueue, QueueRepeatMode, useQueue } from 'discord-player';
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

	const nowPlayingEmbed = new EmbedBuilder()
		.setTitle(currentTrack.title)
		.setDescription(queue?.node.createProgressBar())
		.setURL(currentTrack.url)
		.setAuthor({ name: currentTrack.author })
		.setThumbnail(currentTrack.thumbnail);

	const now = new Date();
	const afterQueueEnds = addMilliseconds(new Date(), queue.estimatedDuration);

	const trackEndsAt = afterQueueEnds.toLocaleTimeString('pl', {
		hour: '2-digit',
		minute: '2-digit',
	});

	const queueEmbed = new EmbedBuilder()
		.setTitle('Up next')
		.addFields([
			{
				name: 'Tracks',
				value: `${queue?.size ?? '*unknown*'}`,
				inline: true,
			},
			{
				name: 'Duration',
				value: !queue?.estimatedDuration
					? '0:00'
					: `${formatDistance(now, afterQueueEnds)}`,
				inline: true,
			},
			{
				name: 'Ending time',
				value: !queue?.estimatedDuration ? 'N/A' : trackEndsAt,
				inline: true,
			},
		])
		.setDescription(embedDescriptions[0].join('\n') || 'The queue is empty.')
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
		content: `**Currently playing ${queue.repeatMode === QueueRepeatMode.TRACK ? 'on repeat 🔁' : ''}**`,
		embeds: [nowPlayingEmbed, queueEmbed],
		components: [row],
	});

	await componentResponseListener(response, {
		queue,
		nowPlayingEmbed,
		queueEmbed,
		embedDescriptions,
		previous,
		next,
	});
}

type ListenerProps = {
	queue: GuildQueue;
	nowPlayingEmbed: EmbedBuilder;
	queueEmbed: EmbedBuilder;
	embedDescriptions: string[][];
	previous: ButtonBuilder;
	next: ButtonBuilder;
};

async function componentResponseListener(
	response: InteractionResponse<boolean> | Message<boolean>,
	properties: ListenerProps,
) {
	const {
		queue,
		nowPlayingEmbed,
		queueEmbed,
		embedDescriptions,
		previous,
		next,
	} = properties;

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

		const updatedRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
			previous,
			next,
		);

		const nextResponse = await answer.update({
			content: `**Currently playing ${queue.repeatMode === QueueRepeatMode.TRACK ? 'on repeat 🔁' : ''}**`,
			embeds: [nowPlayingEmbed, queueEmbed],
			components: [updatedRow],
		});

		await componentResponseListener(nextResponse, properties);
	} catch {
		await response.edit({
			components: [],
		});
	}
}
