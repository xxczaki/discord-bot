import type { ChatInputCommandInteraction } from 'discord.js';
import useQueueWithValidation from '../utils/useQueueWithValidation';

export default async function volumeCommandHandler(
	interaction: ChatInputCommandInteraction,
) {
	const queue = useQueueWithValidation(interaction);

	if (!queue) return;

	const volume = interaction.options.getInteger('value', true);

	queue.node.setVolume(volume);

	await interaction.reply(`Volume changed to \`${volume}\`.`);
}
