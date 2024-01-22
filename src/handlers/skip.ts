import { useQueue } from 'discord-player';
import { type ChatInputCommandInteraction, type CacheType } from 'discord.js';

export default async function skipCommandHandler(
	interaction: ChatInputCommandInteraction<CacheType>,
) {
	const queue = useQueue(interaction.guild?.id ?? '');

	queue?.node.skip();

	await interaction.reply('Track skipped.');
}
