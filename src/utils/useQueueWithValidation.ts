import type { ChatInputCommandInteraction } from 'discord.js';
import { useQueue } from 'discord-player';
import reportError from './reportError';

export default function useQueueWithValidation(
	interaction: ChatInputCommandInteraction,
	customMessage?: string,
) {
	const queue = useQueue();

	if (!queue) {
		const message = customMessage ?? 'No music is currently playing.';

		interaction
			.reply({
				content: message,
				flags: ['Ephemeral'],
			})
			.catch((error) => {
				reportError(error, 'Failed to send queue validation error message');
			});

		return null;
	}

	return queue;
}
