import { useQueue } from 'discord-player';
import type { ChatInputCommandInteraction } from 'discord.js';

export default async function sortCommandHandler(
	interaction: ChatInputCommandInteraction,
) {
	const queue = useQueue();

	if (!queue) {
		return interaction.reply({
			content: 'The queue is empty.',
			flags: ['Ephemeral'],
		});
	}

	await interaction.reply('Sorting the queue…');

	queue.tracks.store = queue?.tracks.data.sort((a, b) => {
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
