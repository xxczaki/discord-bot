import type { ChatInputCommandInteraction } from 'discord.js';
import { QueueRepeatMode } from 'discord-player';
import useQueueWithValidation from '../utils/useQueueWithValidation';

export default async function repeatCommandHandler(
	interaction: ChatInputCommandInteraction,
) {
	const queue = useQueueWithValidation(interaction);

	if (!queue) return;

	const mode = interaction.options.getInteger('repeat_mode', true);

	queue.setRepeatMode(mode as QueueRepeatMode);

	switch (mode) {
		case QueueRepeatMode.OFF:
			return interaction.reply('Repeat mode disabled.');
		case QueueRepeatMode.TRACK:
			return interaction.reply('The current track will repeat indefinitely.');
		case QueueRepeatMode.QUEUE:
			return interaction.reply('The queue will repeat indefinitely.');
		default:
			throw new TypeError('Unknown or illegal repeat mode.');
	}
}
