import { useQueue } from 'discord-player';
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	type CacheType,
	type ChatInputCommandInteraction,
	type ComponentType,
} from 'discord.js';
import { QueueRecoveryService } from '../utils/QueueRecoveryService';
import enqueueTracks from '../utils/enqueueTracks';

const queueRecoveryService = QueueRecoveryService.getInstance();

export default async function recoverCommandHandler(
	interaction: ChatInputCommandInteraction<CacheType>,
) {
	const queue = useQueue(interaction.guild?.id ?? '');

	if (queue) {
		return interaction.reply(
			'Recovery not possible when a queue already exists. Please purge it first.',
		);
	}

	await interaction.deferReply();

	const tracks = await queueRecoveryService.getContents();

	if (!tracks) {
		return interaction.editReply('Nothing to recover.');
	}

	const yes = new ButtonBuilder()
		.setCustomId('proceed')
		.setLabel('Proceed')
		.setStyle(ButtonStyle.Success);
	const cancel = new ButtonBuilder()
		.setCustomId('cancel')
		.setLabel('Cancel')
		.setStyle(ButtonStyle.Secondary);

	const row = new ActionRowBuilder<ButtonBuilder>().addComponents(yes, cancel);

	const response = await interaction.editReply({
		content: `Found a queue to recover, with ${tracks.length} track(s).\n`,
		components: [row],
	});

	try {
		const answer = await response.awaitMessageComponent<ComponentType.Button>({
			time: 60_000, // 1 minute
		});

		await answer.deferUpdate();

		switch (answer.customId) {
			case 'proceed':
				return enqueueTracks(answer, tracks);
			default:
				await queueRecoveryService.deleteQueue();
				return interaction.editReply({
					content: 'The queue will not be recovered.',
					components: [],
				});
		}
	} catch {
		return interaction.editReply({
			content: 'The queue will not be recovered.',
			components: [],
		});
	}
}
