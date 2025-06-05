import type { ChatInputCommandInteraction } from 'discord.js';
import useQueueWithValidation from '../utils/useQueueWithValidation';

export default async function moveCommandHandler(
	interaction: ChatInputCommandInteraction,
) {
	const queue = useQueueWithValidation(interaction);

	if (!queue) return;

	const query = interaction.options.getString('query', true);
	const from = Number.parseInt(query, 10) - 2;

	if (Number.isNaN(from)) {
		return interaction.reply({
			content: 'Please provide a number.',
			flags: ['Ephemeral'],
		});
	}

	const to = interaction.options.getInteger('to', true) - 2;

	if (from === to) {
		return interaction.reply({
			content: 'Nothing to move.',
			flags: ['Ephemeral'],
		});
	}

	try {
		const trackToMove = queue.tracks.at(from);

		if (!trackToMove) {
			throw 'fallthrough to catch block';
		}

		if (to < 0) {
			queue.moveTrack(trackToMove, 0);
			queue.node.skip();

			return await interaction.reply('Skipping the current track.');
		}

		queue.moveTrack(from, to);

		await interaction.reply(
			`Moved "${trackToMove.title}" to position \`${to + 2}\`.`,
		);
	} catch {
		await interaction.reply({
			content: 'Could not move the track, are the specified positions correct?',
			flags: ['Ephemeral'],
		});
	}
}
