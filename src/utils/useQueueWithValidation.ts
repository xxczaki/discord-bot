import type { ChatInputCommandInteraction } from 'discord.js';
import { useQueue } from 'discord-player';

export default function useQueueWithValidation(
	interaction: ChatInputCommandInteraction,
	customMessage?: string,
) {
	const queue = useQueue();

	if (!queue) {
		const message = customMessage ?? 'No music is currently playing.';

		void interaction.reply({
			content: message,
			flags: ['Ephemeral'],
		});

		return null;
	}

	return queue;
}
