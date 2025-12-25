import type { Client } from 'discord.js';
import type { Player } from 'discord-player';
import { useQueue } from 'discord-player';
import deleteOpusCacheEntry from '../utils/deleteOpusCacheEntry';
import getCommitLink from '../utils/getCommitLink';
import getDeploymentVersion from '../utils/getDeploymentVersion';
import getEnvironmentVariable from '../utils/getEnvironmentVariable';
import isObject from '../utils/isObject';
import logger from '../utils/logger';
import { QueueRecoveryService } from '../utils/QueueRecoveryService';
import useAutocompleteHandler from './useAutocompleteHandler';
import useCommandHandlers from './useCommandHandlers';

const QUEUE_SAVE_DEBOUNCE_MS = 2000;

const queueRecoveryService = QueueRecoveryService.getInstance();

let queueSaveTimeout: NodeJS.Timeout | null = null;

export function useReadyEventHandler(client: Client): void {
	client.on('clientReady', async () => {
		logger.info(`Logged in as ${client.user?.tag}!`);

		const channel = client.channels.cache.get(
			getEnvironmentVariable('BOT_DEBUG_CHANNEL_ID'),
		);
		const commitHash = process.env.GIT_COMMIT_SHA;
		const wasDeploymentManual = !commitHash;
		const deploymentVersion = await getDeploymentVersion();

		if (channel?.isSendable() && !wasDeploymentManual) {
			const versionInfo = deploymentVersion
				? `version ${deploymentVersion}`
				: `commit ${getCommitLink(commitHash)}`;

			await channel.send(`🎶 Ready to play, running ${versionInfo}.`);
		}
	});
}

export default function useDiscordEventHandlers(
	client: Client,
	player: Player,
): void {
	client.on('interactionCreate', async (interaction) => {
		if (!interaction.guild) {
			throw new TypeError('Guild is not defined!');
		}

		const context = {
			guild: interaction.guild,
		};

		await player.context.provide(context, async () => {
			if (interaction.isAutocomplete()) {
				await useAutocompleteHandler(interaction);
				return;
			}

			if (interaction.isChatInputCommand()) {
				await useCommandHandlers(interaction);
				return;
			}
		});
	});

	client.on('voiceStateUpdate', async (oldState) => {
		const context = {
			guild: oldState.guild,
		};

		await player.context.provide(context, async () => {
			const queue = useQueue(oldState.guild.id);

			if (!queue || queue.size === 0) {
				return;
			}

			if (queueSaveTimeout) {
				clearTimeout(queueSaveTimeout);
			}

			queueSaveTimeout = setTimeout(() => {
				void queueRecoveryService.saveQueue(queue);
				queueSaveTimeout = null;
			}, QUEUE_SAVE_DEBOUNCE_MS);

			const track = queue.currentTrack;

			if (!track) {
				return;
			}

			if (isObject(track.metadata) && track.metadata.isFromCache) {
				return;
			}

			void deleteOpusCacheEntry(track.url);
		});
	});
}
