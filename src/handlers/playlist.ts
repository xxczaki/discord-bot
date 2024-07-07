import { useQueue } from 'discord-player';
import type { CacheType, ChatInputCommandInteraction } from 'discord.js';
import { ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';

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
		const { PLAYLISTS_CHANNEL_ID } = await import('../constants/channelIds');

		const channel = interaction.client.channels.cache.get(PLAYLISTS_CHANNEL_ID);

		if (channel?.isTextBased()) {
			const messages = await channel.messages.fetch({ limit: 20, cache: true });
			const idMarker = `id="${identifier}"`;
			const message = messages.find((message) =>
				message.content.includes(idMarker),
			);

			if (!message) {
				await interaction.editReply(
					'Playlist with such id does not seem to exist on the `#listy-piosenek` channel.',
				);
				return;
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

	const { ActionRowBuilder } = await import('discord.js');

	const firstRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
		songsInput,
	);
	const secondRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
		toPickInput,
	);

	modal.addComponents(firstRow, secondRow);

	await interaction.showModal(modal);
}
