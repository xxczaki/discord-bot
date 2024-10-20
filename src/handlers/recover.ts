import type { CacheType, ChatInputCommandInteraction } from 'discord.js';
import { QueueRecoveryService } from '../utils/QueueRecoveryService';

const queueRecoveryService = QueueRecoveryService.getInstance();

export default async function recoverCommandHandler(
	interaction: ChatInputCommandInteraction<CacheType>,
) {
	if (!queueRecoveryService.isRecoverable) {
		return interaction.reply('Nothing to recover.');
	}

	const numberOfTracks = await queueRecoveryService.getNumberOfTracks();

	return interaction.reply(
		`Found a queue to recover, with ${numberOfTracks} track(s). Proceed?`,
	);
}
