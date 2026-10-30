import type { Client } from 'discord.js';
import type { Player } from 'discord-player';
import { useQueue } from 'discord-player';
import getCommitLink from '../utils/getCommitLink.ts';
import getEnvironmentVariable from '../utils/getEnvironmentVariable.ts';
import isObject from '../utils/isObject.ts';
import logger from '../utils/logger.ts';
import { OpusCacheManager } from '../utils/OpusCacheManager.ts';
import { QueueRecoveryService } from '../utils/QueueRecoveryService.ts';
import useAutocompleteHandler from './useAutocompleteHandler.ts';
import useCommandHandlers from './useCommandHandlers.ts';

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

		if (channel?.isSendable() && !wasDeploymentManual) {
			await channel.send(
				`🎶 Ready to play, running commit ${getCommitLink(commitHash)}.`,
			);
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

	client.on('voiceStateUpdate', async (oldState, newState) => {
		const context = {
			guild: oldState.guild,
		};

		await player.context.provide(context, async () => {
			const queue = useQueue(oldState.guild.id);

			if (!queue || queue.size === 0) {
				return;
			}

			/* v8 ignore start */
			if (queueSaveTimeout) {
				clearTimeout(queueSaveTimeout);
			}
			/* v8 ignore stop */

			/* v8 ignore start */
			queueSaveTimeout = setTimeout(() => {
				void queueRecoveryService.saveQueue(queue);
				queueSaveTimeout = null;
			}, QUEUE_SAVE_DEBOUNCE_MS);
			/* v8 ignore stop */

			if (oldState.channelId === newState.channelId) {
				return;
			}

			const track = queue.currentTrack;

			if (!track) {
				return;
			}

			if (isObject(track.metadata) && track.metadata.isFromCache) {
				return;
			}

			const opusCacheManager = OpusCacheManager.getInstance();
			const filename = opusCacheManager.generateFilename({
				title: track.cleanTitle,
				author: track.author,
				durationMS: track.durationMS,
			});

			void opusCacheManager.deleteEntry(filename);
		});
	});
}
