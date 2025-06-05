import type { ChatInputCommandInteraction } from 'discord.js';
import { QueueRecoveryService } from '../utils/QueueRecoveryService';
import deleteOpusCacheEntry from '../utils/deleteOpusCacheEntry';
import isObject from '../utils/isObject';
import useQueueWithValidation from '../utils/useQueueWithValidation';

const queueRecoveryService = QueueRecoveryService.getInstance();

export default async function purgeCommandHandler(
	interaction: ChatInputCommandInteraction,
) {
	const queue = useQueueWithValidation(interaction);

	if (!queue) return;

	const track = queue.currentTrack;

	if (track && isObject(track.metadata) && !('isFromCache' in track.metadata)) {
		await deleteOpusCacheEntry(track.url);
	}

	if (queue.size > 0) {
		await queueRecoveryService.saveQueue(queue);
	}

	queue.delete();

	await interaction.reply(
		'Queue purged.\n\nUse `/recover` to listen to the same queue again.',
	);
}
