import type { ChatInputCommandInteraction } from 'discord.js';
import useQueueWithValidation from '../utils/useQueueWithValidation';

export default async function pauseCommandHandler(
	interaction: ChatInputCommandInteraction,
) {
	const queue = useQueueWithValidation(interaction);

	if (!queue) return;

	if (queue.node.isPaused()) {
		return interaction.editReply(
			'The track is already paused. Maybe you want to `/resume` it instead?',
		);
	}

	queue.node.setPaused(true);

	await interaction.editReply('Track paused.');
}
