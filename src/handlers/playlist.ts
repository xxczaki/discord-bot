import type { ChatInputCommandInteraction, CacheType } from 'discord.js';
import {
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
	ActionRowBuilder,
} from 'discord.js';
import { PLAYLISTS_CHANNEL_ID } from '../constants/channelIds';
import { useQueue } from 'discord-player';

export default async function playlistCommandHandler(
	interaction: ChatInputCommandInteraction<CacheType>,
) {
	const queue = useQueue(interaction.guild?.id ?? '');

	queue?.filters.ffmpeg.setInputArgs(['-threads', '4']);

	const identifier = interaction.options.getString('id');

	const modal = new ModalBuilder()
		.setCustomId('modal')
		.setTitle('Playlist loader');

	const songsInput = new TextInputBuilder()
		.setCustomId('songsInput')
		.setLabel('Enter songs, one in each line')
		.setRequired(true)
		.setPlaceholder(
			'my way sinatra\ntoto africa\nhttps://www.youtube.com/watch?v=25FF3fRxWWY',
		)
		.setStyle(TextInputStyle.Paragraph);

	if (identifier) {
		const channel = interaction.client.channels.cache.get(PLAYLISTS_CHANNEL_ID);

		if (channel && channel.isTextBased()) {
			const messages = await channel.messages.fetch({ limit: 20, cache: true });
			const idMarker = `id="${identifier}"`;
			const message = messages.find(message =>
				message.content.includes(idMarker),
			);

			if (!message) {
				return interaction.reply({
					content:
						'Playlist with such id does not seem to exist on the `#listy-piosenek` channel.',
					ephemeral: true,
				});
			}

			const content = message.content
				.replace(idMarker, '')
				.replaceAll('`', '')
				.trim();

			songsInput.setValue(content);
		}
	}

	const toPickInput = new TextInputBuilder()
		.setCustomId('toPickInput')
		.setLabel('Number of songs to be randomly picked')
		.setPlaceholder('20')
		.setRequired(false)
		.setStyle(TextInputStyle.Short);

	const firstRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
		songsInput,
	);
	const secondRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
		toPickInput,
	);

	modal.addComponents(firstRow, secondRow);

	return interaction.showModal(modal);
}
