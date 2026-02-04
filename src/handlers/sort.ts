import type { ChatInputCommandInteraction } from 'discord.js';
import useQueueWithValidation from '../utils/useQueueWithValidation';

export default async function sortCommandHandler(
	interaction: ChatInputCommandInteraction,
) {
	const queue = useQueueWithValidation(interaction, {
		message: 'The queue is empty.',
	});

	if (!queue) return;

	await interaction.reply('Sorting the queue…');

	queue.tracks.store = queue.tracks.data.sort((a, b) => {
		const titleA = a.title.toLowerCase();
		const titleB = b.title.toLowerCase();

		if (titleA < titleB) {
			return -1;
		}

		if (titleA > titleB) {
			return 1;
		}

		return 0;
	});

	await interaction.editReply('Queue sorted alphabetically.');
}
