import type { ChatInputCommandInteraction } from 'discord.js';
import { useQueue } from 'discord-player';
import reportError from './reportError';

type Options = {
	message?: string;
	deferred?: boolean;
};

export default function useQueueWithValidation(
	interaction: ChatInputCommandInteraction,
	options?: Options,
) {
	const queue = useQueue();

	if (!queue) {
		const message = options?.message ?? 'No music is currently playing.';

		if (options?.deferred) {
			interaction.editReply(message).catch(
				/* v8 ignore start */
				(error) => {
					reportError(error, 'Failed to send queue validation error message');
				},
				/* v8 ignore stop */
			);
		} else {
			interaction
				.reply({
					content: message,
					flags: ['Ephemeral'],
				})
				.catch(
					/* v8 ignore start */
					(error) => {
						reportError(error, 'Failed to send queue validation error message');
					},
					/* v8 ignore stop */
				);
		}

		return null;
	}

	return queue;
}
