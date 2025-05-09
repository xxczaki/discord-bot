import { useQueue } from 'discord-player';
import type { ChatInputCommandInteraction } from 'discord.js';

export default async function resumeCommandHandler(
	interaction: ChatInputCommandInteraction,
) {
	const queue = useQueue();

	queue?.node.setPaused(false);

	await interaction.reply('Track resumed.');
}
