import { useQueue } from 'discord-player';
import type { ChatInputCommandInteraction } from 'discord.js';
import { QueueRecoveryService } from '../utils/QueueRecoveryService';
import deleteOpusCacheEntry from '../utils/deleteOpusCacheEntry';
import isObject from '../utils/isObject';

const queueRecoveryService = QueueRecoveryService.getInstance();

export default async function purgeCommandHandler(
	interaction: ChatInputCommandInteraction,
) {
	const queue = useQueue();

	const track = queue?.currentTrack;

	if (track && isObject(track.metadata) && !('isFromCache' in track.metadata)) {
		await deleteOpusCacheEntry(track.url);
	}

	if (queue && queue.size > 0) {
		await queueRecoveryService.saveQueue(queue);
	}

	queue?.delete();

	await interaction.reply(
		'Queue purged.\n\nUse `/recover` to listen to the same queue again.',
	);
}
