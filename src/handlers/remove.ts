import type { ChatInputCommandInteraction } from 'discord.js';
import useQueueWithValidation from '../utils/useQueueWithValidation';

export default async function removeCommandHandler(
	interaction: ChatInputCommandInteraction,
) {
	const queue = useQueueWithValidation(interaction);

	if (!queue) return;

	const query = interaction.options.getString('query', true);
	const trackNumber = Number.parseInt(query, 10) - 2;

	if (Number.isNaN(trackNumber)) {
		return interaction.reply({
			content: 'Please provide a number.',
			flags: ['Ephemeral'],
		});
	}

	try {
		const trackToRemove = queue.tracks.at(trackNumber);

		if (!trackToRemove) {
			throw 'fallthrough to catch block';
		}

		if (trackNumber < 0) {
			queue.node.skip();

			await interaction.reply('Skipping the current track.');
		} else {
			queue.removeTrack(trackNumber);

			await interaction.reply(`Track "${trackToRemove.title}" removed.`);
		}
	} catch {
		await interaction.reply({
			content: 'Could not remove the track, is the specified id correct?',
			flags: ['Ephemeral'],
		});
	}
}
