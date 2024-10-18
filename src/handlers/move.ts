import { useQueue } from 'discord-player';
import type { CacheType, ChatInputCommandInteraction } from 'discord.js';

export default async function moveCommandHandler(
	interaction: ChatInputCommandInteraction<CacheType>,
) {
	const queue = useQueue(interaction.guild?.id ?? '');

	const from = interaction.options.getInteger('from', true) - 1;
	const to = interaction.options.getInteger('to', true) - 1;

	if (from === to) {
		return interaction.reply('Nothing to move.');
	}

	try {
		const trackToMove = queue?.tracks.at(from);

		if (!trackToMove) {
			throw 'fallthrough to catch block';
		}

		queue?.moveTrack(from, to);

		await interaction.reply(
			`Moved "${trackToMove.title}" to position \`${to + 1}\`.`,
		);
	} catch {
		await interaction.reply(
			'Could not move the track, are the specified positions correct?',
		);
	}
}
