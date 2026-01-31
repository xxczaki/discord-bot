import type { ChatInputCommandInteraction } from 'discord.js';
import isObject from '../utils/isObject';
import { OpusCacheManager } from '../utils/OpusCacheManager';
import { QueueRecoveryService } from '../utils/QueueRecoveryService';
import useQueueWithValidation from '../utils/useQueueWithValidation';

const queueRecoveryService = QueueRecoveryService.getInstance();

export default async function purgeCommandHandler(
	interaction: ChatInputCommandInteraction,
) {
	const queue = useQueueWithValidation(interaction);

	if (!queue) return;

	const track = queue.currentTrack;

	if (track && isObject(track.metadata) && !('isFromCache' in track.metadata)) {
		const opusCacheManager = OpusCacheManager.getInstance();
		const filename = opusCacheManager.generateFilename({
			title: track.cleanTitle,
			author: track.author,
			durationMS: track.durationMS,
		});
		void opusCacheManager.deleteEntry(filename);
	}

	if (queue.size > 0) {
		void queueRecoveryService.saveQueue(queue);
	}

	queue.delete();

	await interaction.reply(
		'Queue purged.\n\nUse `/recover` to listen to the same queue again.',
	);
}
