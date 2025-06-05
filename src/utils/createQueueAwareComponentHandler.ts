import { type GuildQueue, useMainPlayer } from 'discord-player';
import type { InteractionResponse, Message } from 'discord.js';
import { DEFAULT_MESSAGE_COMPONENT_AWAIT_TIME_MS } from '../constants/miscellaneous';

type QueueAwareComponentHandlerOptions = {
	response: InteractionResponse<boolean> | Message<boolean>;
	queue: GuildQueue<unknown>;
	timeout?: number;
	onQueueDestroyed?: () => Promise<void> | void;
};

export default function createQueueAwareComponentHandler({
	response,
	queue,
	timeout = DEFAULT_MESSAGE_COMPONENT_AWAIT_TIME_MS,
	onQueueDestroyed,
}: QueueAwareComponentHandlerOptions) {
	const player = useMainPlayer();
	const guildId = queue.guild?.id;

	let cleanedUp = false;

	const cleanup = async (reason: 'timeout' | 'queue-destroyed') => {
		if (cleanedUp) return;
		cleanedUp = true;

		clearTimeout(timeoutId);

		player.events.off('emptyQueue', onEmptyQueue);
		player.events.off('queueDelete', onQueueDelete);

		try {
			await response.edit({ components: [] });
		} catch {}

		if (reason === 'queue-destroyed') {
			await onQueueDestroyed?.();
		}
	};

	const onEmptyQueue = async (eventQueue: GuildQueue<unknown>) => {
		if (eventQueue.guild?.id !== guildId) return;
		await cleanup('queue-destroyed');
	};

	const onQueueDelete = async (eventQueue: GuildQueue<unknown>) => {
		if (eventQueue.guild?.id !== guildId) return;

		await cleanup('queue-destroyed');
	};

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
