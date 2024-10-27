import { useQueue } from 'discord-player';
import type { CacheType, ChatInputCommandInteraction } from 'discord.js';

export default async function purgeCommandHandler(
	interaction: ChatInputCommandInteraction<CacheType>,
) {
	const queue = useQueue(interaction.guild?.id ?? '');

	queue?.delete();

	await interaction.reply('Queue purged.');
}
