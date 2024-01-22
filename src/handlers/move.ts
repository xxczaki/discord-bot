import { useQueue } from 'discord-player';
import { type ChatInputCommandInteraction, type CacheType } from 'discord.js';

export default async function moveCommandHandler(
	interaction: ChatInputCommandInteraction<CacheType>,
) {
	const queue = useQueue(interaction.guild?.id ?? '');

	const from = interaction.options.getInteger('from', true);
	const to = interaction.options.getInteger('to', true);

	try {
		const trackToMove = queue?.tracks.at(from - 1);

		if (!trackToMove) {
			throw 'fallthrough to catch block';
		}

		queue?.moveTrack(trackToMove, to - 1);

		await interaction.reply(
			`Moved "${trackToMove.title}" to position \`${to - 1}\`.`,
		);
	} catch {
		await interaction.reply({
			content: 'Could not move the track, are the specified positions correct?',
			ephemeral: true,
		});
	}
}
