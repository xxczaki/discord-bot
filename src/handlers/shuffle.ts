import { useQueue } from 'discord-player';
import { type ChatInputCommandInteraction, type CacheType } from 'discord.js';

export default async function shuffleCommandHandler(
	interaction: ChatInputCommandInteraction<CacheType>,
) {
	const queue = useQueue(interaction.guild?.id ?? '');

	queue?.tracks.shuffle();

	await interaction.reply('Queue shuffled.');
}
