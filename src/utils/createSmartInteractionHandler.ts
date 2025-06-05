import { type GuildQueue, type Track, useMainPlayer } from 'discord-player';
import type { InteractionResponse, Message } from 'discord.js';
import calculateSmartTimeout from './calculateSmartTimeout';
import getTrackPosition from './getTrackPosition';

type SmartInteractionHandlerOptions = {
	response: InteractionResponse<boolean> | Message<boolean>;
	queue: GuildQueue<unknown>;
	track: Track<unknown>;
	onTimeout?: () => Promise<void> | void;
	onTrackChange?: () => Promise<void> | void;
	onQueueEmpty?: () => Promise<void> | void;
};

export default function createSmartInteractionHandler({
	response,
	queue,
	track,
	onTimeout,
	onTrackChange,
	onQueueEmpty,
}: SmartInteractionHandlerOptions) {
	const player = useMainPlayer();
	const trackPosition = getTrackPosition(queue, track);
	const isCurrentlyPlaying = queue.currentTrack?.id === track.id;
	const guildId = queue.guild?.id;

	const timeout = calculateSmartTimeout({
		queue,
		track,
		trackPosition,
		isCurrentlyPlaying,
	});

	let cleanedUp = false;

	const cleanup = async (
		reason: 'timeout' | 'track-change' | 'queue-empty',
	) => {
		if (cleanedUp) return;
		cleanedUp = true;

		clearTimeout(timeoutId);

		player.events.off('playerStart', onPlayerStart);
		player.events.off('playerSkip', onPlayerSkip);
		player.events.off('emptyQueue', onEmptyQueue);
		player.events.off('queueDelete', onQueueDelete);

		try {
			await response.edit({ components: [] });
		} catch {}

		switch (reason) {
			case 'timeout':
				await onTimeout?.();
				break;
			case 'track-change':
				await onTrackChange?.();
				break;
			case 'queue-empty':
				await onQueueEmpty?.();
				break;
		}
	};

	const onPlayerStart = async (
		eventQueue: GuildQueue<unknown>,
		eventTrack: Track<unknown>,
	) => {
		if (eventQueue.guild?.id !== guildId) return;

		if (eventQueue.size === 0 && eventTrack.id === track.id) {
			return;
		}

		if (eventTrack.id !== track.id) {
			const stillInQueue = eventQueue.tracks.some(({ id }) => id === track.id);

			if (!stillInQueue) {
				await cleanup('track-change');
			}
		}
	};

	const onPlayerSkip = async (
		eventQueue: GuildQueue<unknown>,
		eventTrack: Track<unknown>,
	) => {
		if (eventQueue.guild?.id !== guildId) return;

		if (eventTrack.id === track.id) {
			await cleanup('track-change');
		}
	};

	const onEmptyQueue = async (eventQueue: GuildQueue<unknown>) => {
		if (eventQueue.guild?.id !== guildId) return;

		await cleanup('queue-empty');
	};

	const onQueueDelete = async (eventQueue: GuildQueue<unknown>) => {
		if (eventQueue.guild?.id !== guildId) return;

		await cleanup('queue-empty');
	};

	player.events.on('playerStart', onPlayerStart);
	player.events.on('playerSkip', onPlayerSkip);
	player.events.on('emptyQueue', onEmptyQueue);
	player.events.on('queueDelete', onQueueDelete);

	const timeoutId = setTimeout(async () => {
		await cleanup('timeout');
	}, timeout);

	return {
		cleanup: () => cleanup('timeout'),
		timeout,
	};
}
