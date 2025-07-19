import { opendir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
	ActionRowBuilder,
	ButtonBuilder,
	type ButtonInteraction,
	ButtonStyle,
	type ChatInputCommandInteraction,
	ComponentType,
	EmbedBuilder,
} from 'discord.js';
import prettyBytes from 'pretty-bytes';
import { DEFAULT_MESSAGE_COMPONENT_AWAIT_TIME_MS } from '../constants/miscellaneous';
import getEnvironmentVariable from '../utils/getEnvironmentVariable';
import getOpusCacheDirectoryPath from '../utils/getOpusCacheDirectoryPath';
import logger from '../utils/logger';
import pluralize from '../utils/pluralize';
import redis from '../utils/redis';
import reportError from '../utils/reportError';

const opusCacheDirectory = getOpusCacheDirectoryPath();
const OWNER_ID = getEnvironmentVariable('OWNER_USER_ID');

interface CacheStats {
	queryCache: {
		count: number;
		size: number;
	};
	externalPlaylistCache: {
		count: number;
		size: number;
	};
	opusCache: {
		count: number;
		size: number;
	};
}

export default async function cacheCommandHandler(
	interaction: ChatInputCommandInteraction,
) {
	await interaction.reply('Loading cache statistics…');

	try {
		const usedButtons = new Set<string>();
		const actionRow = createActionRow(interaction.user.id === OWNER_ID);
		const stats = await gatherCacheStatsWithLiveUpdates(
			interaction,
			usedButtons,
			actionRow,
		);

		await interaction.editReply({
			embeds: [createCacheStatsEmbed(stats)],
			components: [actionRow],
			content: null,
		});

		const collector = interaction.channel?.createMessageComponentCollector({
			componentType: ComponentType.Button,
			time: DEFAULT_MESSAGE_COMPONENT_AWAIT_TIME_MS,
		});

		collector?.on('collect', async (buttonInteraction: ButtonInteraction) => {
			if (buttonInteraction.user.id !== OWNER_ID) {
				await buttonInteraction.reply({
					content: '❌ Only the bot owner can use these buttons.',
					flags: ['Ephemeral'],
				});
				return;
			}

			try {
				usedButtons.add(buttonInteraction.customId);
				const remainingActionRow = createActionRowWithUsedButtons(usedButtons);

				await buttonInteraction.update({
					embeds: [createCacheStatsEmbed(stats)],
					components:
						remainingActionRow.components.length > 0
							? [remainingActionRow]
							: [],
				});

				switch (buttonInteraction.customId) {
					case 'flush_query_cache':
						await flushQueryCache();
						break;
					case 'flush_external_playlist_cache':
						await flushExternalPlaylistCache();
						break;
					default:
						return;
				}

				const newStats = await gatherCacheStatsWithLiveUpdates(
					interaction,
					usedButtons,
				);
				await interaction.editReply({
					embeds: [createCacheStatsEmbed(newStats)],
					components:
						remainingActionRow.components.length > 0
							? [remainingActionRow]
							: [],
				});
			} catch (error) {
				reportError(error, 'Failed to process cache flush button');
			}
		});

		collector?.on('end', async () => {
			try {
				await interaction.editReply({
					embeds: [createCacheStatsEmbed(stats)],
					components: [],
				});
			} catch {}
		});
	} catch (error) {
		reportError(error, 'Failed to gather cache statistics');
		await interaction.editReply({
			content: '❌ Something went wrong while gathering cache statistics.',
		});
	}
}

async function gatherCacheStatsWithLiveUpdates(
	interaction: ChatInputCommandInteraction,
	usedButtons: Set<string>,
	initialActionRow?: ActionRowBuilder<ButtonBuilder>,
): Promise<CacheStats> {
	const stats: CacheStats = {
		queryCache: { count: 0, size: 0 },
		externalPlaylistCache: { count: 0, size: 0 },
		opusCache: { count: 0, size: 0 },
	};

	let lastUpdateTime = 0;
	const UPDATE_THROTTLE_MS = 500;

	const updateDisplay = async (force = false) => {
		const now = Date.now();

		if (!force && now - lastUpdateTime < UPDATE_THROTTLE_MS) {
			return;
		}
		
		lastUpdateTime = now;

		try {
			const embed = createCacheStatsEmbed(stats);
			const actionRow =
				initialActionRow || createActionRowWithUsedButtons(usedButtons);

			await interaction.editReply({
				embeds: [embed],
				components: actionRow.components.length > 0 ? [actionRow] : [],
				content: null,
			});
		} catch {}
	};

	const promises = [
		getRedisCacheStatsWithUpdates('discord-player:query-cache:*', (result) => {
			stats.queryCache = result;
			updateDisplay();
		}),
		getRedisCacheStatsWithUpdates('external-playlist-cache:*', (result) => {
			stats.externalPlaylistCache = result;
			updateDisplay();
		}),
		getOpusCacheStatsWithUpdates((result) => {
			stats.opusCache = result;
			updateDisplay();
		}),
	];

	await Promise.all(promises);

	await updateDisplay(true);

	return stats;
}

async function getRedisCacheStatsWithUpdates(
	pattern: string,
	onUpdate: (result: { count: number; size: number }) => void,
): Promise<void> {
	try {
		const stream = redis.scanStream({
			match: pattern,
			count: 200,
		});

		let count = 0;
		let size = 0;

		return new Promise((resolve, reject) => {
			stream.on('data', async (keys = []) => {
				stream.pause();

				if (keys.length > 0) {
					try {
						const values = await redis.mget(keys);
						const batchSize = values
							.filter(Boolean)
							.reduce(
								(total, value) => total + Buffer.byteLength(value as string),
								0,
							);

						count += keys.length;
						size += batchSize;

						onUpdate({ count, size });

						await new Promise((resolve) => setTimeout(resolve, 25));
					} catch (error) {
						logger.error(
							`Failed to process Redis cache batch for pattern ${pattern}:`,
							error,
						);
					}
				}

				stream.resume();
			});

			stream.on('end', () => {
				onUpdate({ count, size });
				resolve();
			});

			stream.on('error', (error) => {
				logger.error(
					`Failed to scan Redis cache for pattern ${pattern}:`,
					error,
				);
				reject(error);
			});
		});
	} catch (error) {
		logger.error(
			`Failed to get Redis cache stats for pattern ${pattern}:`,
			error,
		);
		onUpdate({ count: 0, size: 0 });
	}
}

async function getOpusCacheStatsWithUpdates(
	onUpdate: (result: { count: number; size: number }) => void,
): Promise<void> {
	try {
		const directory = await opendir(opusCacheDirectory);

		let count = 0;
		let size = 0;
		let processedFiles = 0;

		const BATCH_SIZE = 100;

		for await (const entry of directory) {
			if (entry.isFile()) {
				try {
					const fileStat = await stat(join(opusCacheDirectory, entry.name));
					count++;
					size += fileStat.size;
					processedFiles++;

					if (processedFiles % BATCH_SIZE === 0) {
						onUpdate({ count, size });
						await new Promise((resolve) => setTimeout(resolve, 50));
					}
				} catch (error) {
					logger.error(`Failed to stat file ${entry.name}:`, error);
				}
			}
		}

		onUpdate({ count, size });
	} catch (error) {
		logger.error('Failed to get Opus cache stats:', error);
		onUpdate({ count: 0, size: 0 });
	}
}

function formatCacheField(
	count: number,
	size: number,
	singular: string,
	plural: string,
): string {
	return `${pluralize(singular, plural)`${count} ${null}`}\n${prettyBytes(size)}`;
}

function createCacheStatsEmbed(stats: CacheStats): EmbedBuilder {
	return new EmbedBuilder().setFields([
		{
			name: 'Query cache',
			value: formatCacheField(
				stats.queryCache.count,
				stats.queryCache.size,
				'entry',
				'entries',
			),
			inline: true,
		},
		{
			name: 'External playlist cache',
			value: formatCacheField(
				stats.externalPlaylistCache.count,
				stats.externalPlaylistCache.size,
				'entry',
				'entries',
			),
			inline: true,
		},
		{
			name: 'Opus cache',
			value: formatCacheField(
				stats.opusCache.count,
				stats.opusCache.size,
				'file',
				'files',
			),
			inline: true,
		},
	]);
}

function createActionRow(isOwner: boolean): ActionRowBuilder<ButtonBuilder> {
	if (!isOwner) {
		const row = new ActionRowBuilder<ButtonBuilder>();
		const buttons = [
			new ButtonBuilder()
				.setCustomId('flush_query_cache')
				.setLabel('Flush query cache')
				.setStyle(ButtonStyle.Danger)
				.setDisabled(true),
			new ButtonBuilder()
				.setCustomId('flush_external_playlist_cache')
				.setLabel('Flush playlist cache')
				.setStyle(ButtonStyle.Danger)
				.setDisabled(true),
		];
		row.addComponents(buttons);
		return row;
	}

	return createActionRowWithUsedButtons(new Set());
}

export function createActionRowWithUsedButtons(
	usedButtons: Set<string>,
): ActionRowBuilder<ButtonBuilder> {
	const row = new ActionRowBuilder<ButtonBuilder>();

	const allButtons = [
		{
			customId: 'flush_query_cache',
			label: 'Flush query cache',
		},
		{
			customId: 'flush_external_playlist_cache',
			label: 'Flush playlist cache',
		},
	];

	const remainingButtons = allButtons
		.filter((button) => !usedButtons.has(button.customId))
		.map((button) =>
			new ButtonBuilder()
				.setCustomId(button.customId)
				.setLabel(button.label)
				.setStyle(ButtonStyle.Danger)
				.setDisabled(false),
		);

	if (remainingButtons.length > 0) {
		row.addComponents(remainingButtons);
	}

	return row;
}

export function createActionRowWithRemovedButton(
	removedButtonId: string,
): ActionRowBuilder<ButtonBuilder> {
	const usedButtons = new Set([removedButtonId]);
	return createActionRowWithUsedButtons(usedButtons);
}

async function flushQueryCache(): Promise<void> {
	const stream = redis.scanStream({
		match: 'discord-player:query-cache:*',
		count: 500,
	});

	let _deleted = 0;

	return new Promise((resolve) => {
		stream.on('data', async (keys = []) => {
			stream.pause();

			if (keys.length > 0) {
				try {
					const pipeline = redis.pipeline();

					for (const key of keys) {
						pipeline.del(key);
					}

					await pipeline.exec();
					_deleted += keys.length;
				} catch (error) {
					reportError(error, 'Failed to delete query cache keys from Redis');
				}
			}

			stream.resume();
		});

		stream.on('end', async () => {
			resolve();
		});
	});
}

async function flushExternalPlaylistCache(): Promise<void> {
	const stream = redis.scanStream({
		match: 'external-playlist-cache:*',
		count: 500,
	});

	let _deleted = 0;

	return new Promise((resolve) => {
		stream.on('data', async (keys = []) => {
			stream.pause();

			if (keys.length > 0) {
				try {
					const pipeline = redis.pipeline();

					for (const key of keys) {
						pipeline.del(key);
					}

					await pipeline.exec();
					_deleted += keys.length;
				} catch (error) {
					reportError(
						error,
						'Failed to delete external playlist cache keys from Redis',
					);
				}
			}

			stream.resume();
		});

		stream.on('end', async () => {
			resolve();
		});
	});
}
