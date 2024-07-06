import { useQueue } from 'discord-player';
import type { CacheType, ChatInputCommandInteraction } from 'discord.js';

export default async function deduplicateCommandHandler(
	interaction: ChatInputCommandInteraction<CacheType>,
) {
	const queue = useQueue(interaction.guild?.id ?? '');

	if (!queue) {
		await interaction.editReply('Queue is not defined.');
		return;
	}

	let removed = 0;

	for (const track of queue.tracks.store) {
		if (queue.tracks.store.filter(({ url }) => url === track.url).length > 1) {
			queue.removeTrack(track);
			removed++;
		}
	}

	if (removed === 0) {
		await interaction.editReply('No duplicates were found.');
		return;
	}

	await interaction.editReply(`Removed ${removed} duplicates.`);
}
