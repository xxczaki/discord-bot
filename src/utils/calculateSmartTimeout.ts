import type { GuildQueue, Track } from 'discord-player';
import { DEFAULT_MESSAGE_COMPONENT_AWAIT_TIME_MS as DEFAULT_TIMEOUT } from '../constants/miscellaneous';

const MIN_TIMEOUT = 30 * 1000;
const MAX_TIMEOUT = 10 * 60 * 1000;

type SmartTimeoutOptions = {
	queue: GuildQueue<unknown>;
	track: Track<unknown>;
	trackPosition: number;
	isCurrentlyPlaying: boolean;
};

export default function calculateSmartTimeout({
	queue,
	track,
	trackPosition,
	isCurrentlyPlaying,
}: SmartTimeoutOptions): number {
	if (queue.size === 0 && isCurrentlyPlaying) {
		const currentTrack = queue.currentTrack;

		if (currentTrack?.id === track.id) {
			const currentPosition = queue.node.getTimestamp()?.current.value ?? 0;
			const remainingDuration = Math.max(
				currentTrack.durationMS - currentPosition,
				MIN_TIMEOUT,
			);

			return Math.min(remainingDuration, MAX_TIMEOUT);
		}
	}

	if (queue.size > 0) {
		if (trackPosition <= 3) {
			let estimatedTimeUntilPlay = 0;

			const currentTrack = queue.currentTrack;

			if (currentTrack) {
				const currentPosition = queue.node.getTimestamp()?.current.value ?? 0;

				estimatedTimeUntilPlay += Math.max(
					currentTrack.durationMS - currentPosition,
					0,
				);
			}

			const tracksBeforeThisOne = queue.tracks
				.toArray()
				.slice(0, trackPosition);

			for (const queueTrack of tracksBeforeThisOne) {
				estimatedTimeUntilPlay += queueTrack.durationMS;
			}

			return Math.min(
				Math.max(estimatedTimeUntilPlay, MIN_TIMEOUT),
				MAX_TIMEOUT,
			);
		}

		const positionFactor = Math.max(0.1, 1 - (trackPosition - 3) * 0.1);
		const scaledTimeout = DEFAULT_TIMEOUT * positionFactor;
		return Math.max(scaledTimeout, MIN_TIMEOUT);
	}

	return DEFAULT_TIMEOUT;
}
