import type { ChatInputCommandInteraction } from 'discord.js';
import type { ProcessingInteraction } from '../types/ProcessingInteraction';
import isObject from '../utils/isObject';
import useQueueWithValidation from '../utils/useQueueWithValidation';

export default async function relocateCommandHandler(
	interaction: ChatInputCommandInteraction,
) {
	const queue = useQueueWithValidation(interaction);

	if (!queue) return;

	const { channel } = interaction;

	if (!channel?.isSendable()) {
		return interaction.reply({
			content: 'Unable to relocate. Current channel is not accessible.',
			ephemeral: true,
		});
	}

	if (!isObject(queue.metadata) || !isObject(queue.metadata.interaction)) {
		return interaction.reply({
			content:
				'Unable to relocate. Queue metadata is not properly initialized.',
			ephemeral: true,
		});
	}

	const originalInteraction = queue.metadata
		.interaction as unknown as ProcessingInteraction;

	queue.metadata.interaction = {
		user: originalInteraction.user,
		channel,
		reply: originalInteraction.reply.bind(originalInteraction),
		editReply: originalInteraction.editReply.bind(originalInteraction),
	};

	await interaction.reply('Queue updates will now be sent to this channel.');
}
