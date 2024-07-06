import { useQueue } from 'discord-player';
import type { CacheType, ChatInputCommandInteraction } from 'discord.js';

export default async function pauseCommandHandler(
	interaction: ChatInputCommandInteraction<CacheType>,
) {
	const queue = useQueue(interaction.guild?.id ?? '');

	if (queue?.node.isPaused()) {
		await interaction.editReply('The track is already paused.');
		return;
	}

	queue?.node.setPaused(true);

	await interaction.editReply('Track paused.');
}
