import { useQueue } from 'discord-player';
import type { ChatInputCommandInteraction } from 'discord.js';

export default async function pauseCommandHandler(
	interaction: ChatInputCommandInteraction,
) {
	const queue = useQueue();

	if (queue?.node.isPaused()) {
		return interaction.reply(
			'The track is already paused. Maybe you want to `/resume` it instead?',
		);
	}

	queue?.node.setPaused(true);

	await interaction.reply('Track paused.');
}
