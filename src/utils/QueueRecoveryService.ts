import {
	deserialize,
	type GuildQueue,
	type Player,
	type SerializedTrack,
	serialize,
	type Track,
} from 'discord-player';
import type { QueueMetadata } from '../types/QueueMetadata';
import isObject from './isObject';
import redis from './redis';

function getKeys(guildId: string) {
	return {
		tracks: `queue-recovery:${guildId}:tracks`,
		progress: `queue-recovery:${guildId}:progress`,
		savedAt: `queue-recovery:${guildId}:saved-at`,
		channelId: `queue-recovery:${guildId}:channel-id`,
	};
}

const DEFAULT_CONTENTS = {
	tracks: [],
	progress: 0,
	savedAt: null,
	channelId: null,
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

		const metadata = queue.metadata;
		const channelId =
			isObject(metadata) && 'interaction' in metadata
				? ((metadata as unknown as QueueMetadata).interaction.channel?.id ??
					null)
				: null;

		const keys = getKeys(queue.guild.id);
		const pipeline = redis.pipeline();

		pipeline.set(keys.tracks, JSON.stringify(tracks));
		pipeline.set(keys.progress, queue.node.getTimestamp()?.current.value ?? 0);
		pipeline.set(keys.savedAt, Date.now());

		if (channelId) {
			pipeline.set(keys.channelId, channelId);
		}

		await pipeline.exec();
	}

	async deleteQueue(guildId: string) {
		const keys = getKeys(guildId);
		const pipeline = redis.pipeline();

		pipeline.del(keys.tracks);
		pipeline.del(keys.progress);
		pipeline.del(keys.savedAt);
		pipeline.del(keys.channelId);

		await pipeline.exec();
	}

	async getContents(player: Player, guildId: string) {
		const keys = getKeys(guildId);
		const pipeline = redis.pipeline();

		pipeline.get(keys.tracks);
		pipeline.get(keys.progress);
		pipeline.get(keys.savedAt);
		pipeline.get(keys.channelId);

		const result = await pipeline.exec();

		if (!result) {
			return DEFAULT_CONTENTS;
		}

		const [[, tracks], [, progress], [, savedAt], [, channelId]] = result as [
			[error: Error | null, tracks: string | null],
			[error: Error | null, progress: number],
			[error: Error | null, savedAt: string | null],
			[error: Error | null, channelId: string | null],
		];

		if (!tracks) {
			return DEFAULT_CONTENTS;
		}

		try {
			const parsedTracks = JSON.parse(tracks) as SerializedTrack[];

			return {
				tracks: parsedTracks.map((track) =>
					deserialize(player, track),
				) as Track[],
				progress,
				savedAt: savedAt ? Number.parseInt(savedAt, 10) : null,
				channelId: channelId ?? null,
			};
		} catch {
			return DEFAULT_CONTENTS;
		}
	}
}
