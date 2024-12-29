import { useQueue } from 'discord-player';
import type { CacheType, ChatInputCommandInteraction } from 'discord.js';

export default async function moveCommandHandler(
	interaction: ChatInputCommandInteraction<CacheType>,
) {
	const queue = useQueue(interaction.guild?.id ?? '');

	const query = interaction.options.getString('query', true);
	const from = Number.parseInt(query, 10) - 2;

	if (Number.isNaN(from)) {
		return interaction.reply('Please provide a number.');
	}

	const to = interaction.options.getInteger('to', true) - 2;

	if (from === to) {
		return interaction.reply('Nothing to move.');
	}

	try {
		const trackToMove = queue?.tracks.at(from);

		if (!trackToMove) {
			throw 'fallthrough to catch block';
		}

		if (to < 0) {
			queue?.moveTrack(trackToMove, 0);
			queue?.node.skip();

			return await interaction.reply('Skipping the current track.');
		}

		queue?.moveTrack(from, to);

		await interaction.reply(
			`Moved "${trackToMove.title}" to position \`${to + 2}\`.`,
		);
	} catch {
		await interaction.reply(
			'Could not move the track, are the specified positions correct?',
		);
	}
}
