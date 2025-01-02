import {
	type GuildQueue,
	type Player,
	type SerializedTrack,
	type Track,
	deserialize,
	serialize,
} from 'discord-player';
import redis from './redis';

const DEFAULT_CONTENTS = {
	tracks: [],
	progress: 0,
};

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
		if (!queue || queue.size === 0) {
			return;
		}

		const tracks = [queue.currentTrack, ...queue.tracks.store]
			.filter(Boolean)
			.map((track) => serialize(track));

		const pipeline = redis.pipeline();

		pipeline.set('discord-player:queue', JSON.stringify(tracks));
		pipeline.set(
			'discord-player:progress',
			queue.node.getTimestamp()?.current.value ?? 0,
		);

		await pipeline.exec();
	}

	async deleteQueue() {
		const pipeline = redis.pipeline();

		pipeline.del('discord-player:queue');
		pipeline.del('discord-player:progress');

		await pipeline.exec();
	}

	async getContents(player: Player) {
		const pipeline = redis.pipeline();

		pipeline.get('discord-player:queue');
		pipeline.get('discord-player:progress');

		const result = await pipeline.exec();

		if (!result) {
			return DEFAULT_CONTENTS;
		}

		const [[, tracks], [, progress]] = result as [
			[error: Error | null, tracks: string],
			[error: Error | null, progress: number],
		];

		try {
			const parsedTracks = JSON.parse(tracks) as SerializedTrack[];

			return {
				tracks: parsedTracks.map((track) =>
					deserialize(player, track),
				) as Track[],
				progress,
			};
		} catch (error) {
			return DEFAULT_CONTENTS;
		}
	}
}
