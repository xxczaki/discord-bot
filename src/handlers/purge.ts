import { useQueue } from 'discord-player';
import type { CacheType, ChatInputCommandInteraction } from 'discord.js';
import { QueueRecoveryService } from '../utils/QueueRecoveryService';

const queueRecoveryService = QueueRecoveryService.getInstance();

export default async function purgeCommandHandler(
	interaction: ChatInputCommandInteraction<CacheType>,
) {
	const queue = useQueue(interaction.guild?.id ?? '');

	if (!queue?.isEmpty()) {
		await queueRecoveryService.saveQueue(queue);
	}

	queue?.delete();

	await interaction.reply(
		'Queue purged.\n\nUse `/recover` to listen to the same queue again.',
	);
}
