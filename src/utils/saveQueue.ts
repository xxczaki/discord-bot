import type { GuildQueue } from 'discord-player';
import { QueueRecoveryService } from './QueueRecoveryService';

const queueRecoveryService = QueueRecoveryService.getInstance();

export default async function saveQueue(queue: GuildQueue<unknown> | null) {
	if (!queue) {
		return;
	}

	const currentTrack = queue.currentTrack?.toJSON();

	if (!currentTrack) {
		return queueRecoveryService.saveQueue(null, queue.tracks.toJSON());
	}

	await queueRecoveryService.saveQueue(
		{
			...currentTrack,
			progress: queue.node.getTimestamp()?.current.value ?? 0,
		},
		queue.tracks.toJSON(),
	);
}
