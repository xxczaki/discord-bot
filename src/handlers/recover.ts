import { useMainPlayer, useQueue } from 'discord-player';
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	type CacheType,
	type ChatInputCommandInteraction,
	type ComponentType,
	type GuildMember,
} from 'discord.js';
import { QueueRecoveryService } from '../utils/QueueRecoveryService';
import enqueueTracks from '../utils/enqueueTracks';
import pluralize from '../utils/pluralize';

const queueRecoveryService = QueueRecoveryService.getInstance();

export default async function recoverCommandHandler(
	interaction: ChatInputCommandInteraction<CacheType>,
) {
	const voiceChannel = (interaction.member as GuildMember).voice.channel;

	if (!voiceChannel) {
		return interaction.editReply({
			content: 'You are not connected to a voice channel!',
			components: [],
		});
	}

	const queue = useQueue();

	if (queue) {
		return interaction.reply(
			'Recovery not possible when a queue already exists. Please purge it first.',
		);
	}

	await interaction.deferReply();

	const player = useMainPlayer();
	const { tracks, progress } = await queueRecoveryService.getContents(player);

	if (tracks.length === 0) {
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
		content: pluralize(
			'track',
			'tracks',
		)`Found a queue to recover, with ${tracks.length} ${null}.\n`,
		components: [row],
	});

	try {
		const answer = await response.awaitMessageComponent<ComponentType.Button>({
			time: 60_000, // 1 minute
		});

		switch (answer.customId) {
			case 'proceed':
				return await enqueueTracks(answer, { tracks, progress, voiceChannel });
			default:
				return await interaction.editReply({
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
