import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	type ChatInputCommandInteraction,
} from 'discord.js';
import { DEFAULT_MESSAGE_COMPONENT_AWAIT_TIME_MS } from '../constants/miscellaneous';
import useQueueWithValidation from '../utils/useQueueWithValidation';

export default async function skipCommandHandler(
	interaction: ChatInputCommandInteraction,
) {
	const queue = useQueueWithValidation(interaction);

	if (!queue) return;

	queue.node.skip();

	const undoSkip = new ButtonBuilder()
		.setCustomId('undo-skip')
		.setLabel('Undo')
		.setStyle(ButtonStyle.Secondary);

	const row = new ActionRowBuilder<ButtonBuilder>().addComponents(undoSkip);

	const response = await interaction.editReply({
		content: 'Track skipped.',
		components: [row],
	});

	try {
		if (interaction.channel?.isSendable()) {
			await interaction.channel.sendTyping();
		}
	} catch {}

	try {
		const answer = await response.awaitMessageComponent({
			time: DEFAULT_MESSAGE_COMPONENT_AWAIT_TIME_MS,
		});

		if (answer.customId === 'undo-skip') {
			await queue.history.previous(true);

			await answer.update({
				content: '↩️ Skip was undone.',
				components: [],
			});

			try {
				if (interaction.channel?.isSendable()) {
					await interaction.channel.sendTyping();
				}
			} catch {}
		}
	} catch {
		try {
			await response.edit({ components: [] });
		} catch {}
	}
}
