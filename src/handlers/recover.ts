import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	type ChatInputCommandInteraction,
	type ComponentType,
	type GuildMember,
} from 'discord.js';
import { useMainPlayer, useQueue } from 'discord-player';
import { DEFAULT_MESSAGE_COMPONENT_AWAIT_TIME_MS } from '../constants/miscellaneous';
import enqueueTracks from '../utils/enqueueTracks';
import pluralize from '../utils/pluralize';
import { QueueRecoveryService } from '../utils/QueueRecoveryService';

const queueRecoveryService = QueueRecoveryService.getInstance();

export default async function recoverCommandHandler(
	interaction: ChatInputCommandInteraction,
) {
	const voiceChannel = (interaction.member as GuildMember).voice.channel;

	if (!voiceChannel) {
		return interaction.reply({
			content: 'You are not connected to a voice channel!',
			components: [],
			flags: ['Ephemeral'],
		});
	}

	const queue = useQueue();

	if (queue) {
		return interaction.reply(
			'Recovery not possible when a queue already exists. Please purge it first.',
		);
	}

	await interaction.reply('Looking up what can be recovered…');

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
			time: DEFAULT_MESSAGE_COMPONENT_AWAIT_TIME_MS,
		});

		switch (answer.customId) {
			case 'proceed':
				return await enqueueTracks({
					tracks,
					progress,
					voiceChannel,
					interaction: {
						editReply: answer.editReply.bind(answer),
						reply: answer.reply.bind(answer),
						user: answer.user,
						channel: answer.channel,
					},
				});
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
