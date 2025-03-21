import { useQueue } from 'discord-player';
import type { CacheType, ChatInputCommandInteraction } from 'discord.js';

export default async function sortCommandHandler(
	interaction: ChatInputCommandInteraction<CacheType>,
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
		if (a.title < b.title) {
			return -1;
		}

		if (a.title > b.title) {
			return 1;
		}

		return 0;
	});

	await interaction.editReply('Queue sorted alphabetically.');
}
