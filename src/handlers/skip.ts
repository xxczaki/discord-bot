import type { ChatInputCommandInteraction } from 'discord.js';
import useQueueWithValidation from '../utils/useQueueWithValidation';

export default async function skipCommandHandler(
	interaction: ChatInputCommandInteraction,
) {
	await interaction.deferReply();

	const queue = useQueueWithValidation(interaction, { deferred: true });

	if (!queue) return;

	queue.node.skip();

	await interaction.editReply('Track skipped.');

	try {
		if (interaction.channel?.isSendable()) {
			await interaction.channel.sendTyping();
		}
	} catch {}
}
