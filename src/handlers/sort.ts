import { useQueue } from 'discord-player';
import { type ChatInputCommandInteraction, type CacheType } from 'discord.js';

export default async function sortCommandHandler(
	interaction: ChatInputCommandInteraction<CacheType>,
) {
	const queue = useQueue(interaction.guild?.id ?? '');

	if (!queue) {
		await interaction.reply({
			content: 'Queue is not defined.',
			ephemeral: true,
		});
		return;
	}

	queue.tracks.store = queue?.tracks.data.sort((a, b) => {
		if (a.title < b.title) {
			return -1;
		}

		if (a.title > b.title) {
			return 1;
		}

		return 0;
	});

	await interaction.reply('Queue sorted alphabetically.');
}
