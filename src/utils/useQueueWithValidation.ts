import type { ChatInputCommandInteraction } from 'discord.js';
import { type GuildQueue, useQueue } from 'discord-player';
import type { QueueMetadata } from '../types/QueueMetadata';
import reportError from './reportError';

type Options = {
	message?: string;
};

export default function useQueueWithValidation(
	interaction: ChatInputCommandInteraction,
	options?: Options,
) {
	const queue = useQueue();

	if (!queue) {
		const message = options?.message ?? 'No music is currently playing.';

		interaction.editReply(message).catch(
			/* v8 ignore start */
			(error) => {
				reportError(error, 'Failed to send queue validation error message');
			},
			/* v8 ignore stop */
		);

		return null;
	}

	return queue as GuildQueue<QueueMetadata>;
}
