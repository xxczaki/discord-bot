import { useQueue } from 'discord-player';
import type { ChatInputCommandInteraction } from 'discord.js';

export default async function shuffleCommandHandler(
	interaction: ChatInputCommandInteraction,
) {
	const queue = useQueue();

	queue?.tracks.shuffle();

	await interaction.reply('Queue shuffled.');
}
