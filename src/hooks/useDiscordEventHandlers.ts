import { useQueue } from 'discord-player';
import type { Player } from 'discord-player';
import type { Client } from 'discord.js';
import { QueueRecoveryService } from '../utils/QueueRecoveryService';
import deleteOpusCacheEntry from '../utils/deleteOpusCacheEntry';
import getCommitLink from '../utils/getCommitLink';
import getEnvironmentVariable from '../utils/getEnvironmentVariable';
import isObject from '../utils/isObject';
import logger from '../utils/logger';
import useAutocompleteHandler from './useAutocompleteHandler';
import useCommandHandlers from './useCommandHandlers';

const queueRecoveryService = QueueRecoveryService.getInstance();

export default function useDiscordEventHandlers(
	client: Client,
	player: Player,
): void {
	client.on('ready', async () => {
		logger.info(`Logged in as ${client.user?.tag}!`);

		const channel = client.channels.cache.get(
			getEnvironmentVariable('BOT_DEBUG_CHANNEL_ID'),
		);
		const commitHash = process.env.GIT_COMMIT_SHA;
		const wasDeploymentManual = !commitHash;

		if (channel?.isSendable() && !wasDeploymentManual) {
			await channel.send(
				`🎶 Ready to play, running commit ${getCommitLink(commitHash)}.`,
			);
		}
	});

	client.on('interactionCreate', async (interaction) => {
		if (!interaction.guild) {
			throw new TypeError('Guild is not defined!');
		}

		const context = {
			guild: interaction.guild,
		};

		await player.context.provide(context, async () => {
			await useAutocompleteHandler(interaction);

			if (!interaction.isChatInputCommand()) return;

			await useCommandHandlers(interaction);
		});
	});

	client.on('voiceStateUpdate', async (oldState) => {
		const queue = useQueue(oldState.guild.id);

		void queueRecoveryService.saveQueue(queue);

		const track = queue?.currentTrack;

		if (!track) {
			return;
		}

		if (isObject(track.metadata) && track.metadata.isFromCache) {
			return;
		}

		await deleteOpusCacheEntry(track.url);
	});
}
