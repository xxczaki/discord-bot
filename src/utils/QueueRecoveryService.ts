import {
	type GuildQueue,
	type TrackJSON,
	deserialize,
	serialize,
} from 'discord-player';
import redis from './redis';

export class QueueRecoveryService {
	static #instance: QueueRecoveryService;

	private constructor() {}

	static getInstance(): QueueRecoveryService {
		if (!QueueRecoveryService.#instance) {
			QueueRecoveryService.#instance = new QueueRecoveryService();
		}

		return QueueRecoveryService.#instance;
	}

	async saveQueue(queue: GuildQueue<unknown> | null) {
		if (!queue) {
			return;
		}

		const currentTrack = queue.currentTrack;
		const serializedTracks = queue.tracks.map(serialize);

		if (!currentTrack) {
			return redis.set(
				'discord-player:queue',
				JSON.stringify(serializedTracks),
			);
		}

		const serializedCurrentTrack = {
			...serialize(currentTrack),
			progress: queue.node.getTimestamp()?.current.value ?? 0,
		};

		await redis.set(
			'discord-player:queue',
			JSON.stringify([serializedCurrentTrack, ...serializedTracks]),
		);
	}

	async deleteQueue() {
		await redis.del('discord-player:queue');
	}

	async getContents(): Promise<
		(TrackJSON & { progress?: number | undefined })[]
	> {
		const tracks = await redis.get('discord-player:queue');

		if (!tracks) {
			return [];
		}

		try {
			const parsed = JSON.parse(tracks);

			return parsed.map(deserialize);
		} catch (error) {
			return [];
		}
	}
}
