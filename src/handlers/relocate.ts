import type { ChatInputCommandInteraction } from 'discord.js';
import isObject from '../utils/isObject';
import useQueueWithValidation from '../utils/useQueueWithValidation';

export default async function relocateCommandHandler(
	interaction: ChatInputCommandInteraction,
) {
	const queue = useQueueWithValidation(interaction);

	if (!queue) return;

	const { channel } = interaction;

	if (!channel?.isSendable()) {
		return interaction.editReply(
			'Unable to relocate. Current channel is not accessible.',
		);
	}

	if (!isObject(queue.metadata) || !isObject(queue.metadata.interaction)) {
		return interaction.editReply(
			'Unable to relocate. Queue metadata is not properly initialized.',
		);
	}

	const originalInteraction = queue.metadata.interaction;
	const oldChannel = originalInteraction.channel;

	queue.metadata.interaction = {
		user: originalInteraction.user,
		channel,
		reply: originalInteraction.reply.bind(originalInteraction),
		editReply: originalInteraction.editReply.bind(originalInteraction),
	};

	if (oldChannel?.isSendable()) {
		await oldChannel.send(`Queue updates have been relocated to ${channel}.`);
	}

	await interaction.editReply(
		'Queue updates will now be sent to this channel.',
	);
}
