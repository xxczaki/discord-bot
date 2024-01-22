import { useQueue } from 'discord-player';
import { type ChatInputCommandInteraction, type CacheType } from 'discord.js';

export default async function pauseCommandHandler(
	interaction: ChatInputCommandInteraction<CacheType>,
) {
	const queue = useQueue(interaction.guild?.id ?? '');

	if (queue?.node.isPaused()) {
		await interaction.reply({
			content: 'The track is already paused.',
			ephemeral: true,
		});
		return;
	}

	queue?.node.setPaused(true);

	await interaction.reply('Track paused.');
}
