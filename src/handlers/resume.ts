import { useQueue } from 'discord-player';
import type { CacheType, ChatInputCommandInteraction } from 'discord.js';

export default async function resumeCommandHandler(
	interaction: ChatInputCommandInteraction<CacheType>,
) {
	const queue = useQueue(interaction.guild?.id ?? '');

	queue?.node.setPaused(false);

	await interaction.editReply('Track resumed.');
}
