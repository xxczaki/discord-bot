import { useQueue } from 'discord-player';
import type { ChatInputCommandInteraction } from 'discord.js';

export default async function skipCommandHandler(
	interaction: ChatInputCommandInteraction,
) {
	const queue = useQueue();

	queue?.node.skip();

	await interaction.reply('Track skipped.');
}
