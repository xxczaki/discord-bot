import { useQueue } from 'discord-player';
import type { CacheType, ChatInputCommandInteraction } from 'discord.js';

export default async function deduplicateCommandHandler(
	interaction: ChatInputCommandInteraction<CacheType>,
) {
	const queue = useQueue();

	if (!queue) {
		return interaction.reply('The queue is empty.');
	}

	await interaction.deferReply();

	let removed = 0;

	for (const track of queue.tracks.store) {
		if (queue.tracks.store.filter(({ url }) => url === track.url).length > 1) {
			queue.removeTrack(track);
			removed++;
		}
	}

	if (removed === 0) {
		return interaction.editReply('No duplicates were found.');
	}

	await interaction.editReply(`Removed ${removed} duplicates.`);
}
