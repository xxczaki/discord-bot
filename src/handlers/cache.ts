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
		const stats = await gatherCacheStatsWithLiveUpdates(interaction);
		const actionRow = createActionRow(interaction.user.id === OWNER_ID);

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

			await buttonInteraction.deferReply({ ephemeral: true });

			try {
				switch (buttonInteraction.customId) {
					case 'flush_query_cache':
						await flushQueryCache();
						break;
					case 'flush_external_playlist_cache':
						await flushExternalPlaylistCache();
						break;
					default:
						await buttonInteraction.editReply({
							content: '❌ Unknown action.',
						});
						return;
				}

				await buttonInteraction.deleteReply();
				const newStats = await gatherCacheStatsWithLiveUpdates(interaction);
				await interaction.editReply({
					embeds: [createCacheStatsEmbed(newStats)],
					components: [],
				});
				collector?.stop();
			} catch (error) {
				reportError(error, 'Failed to process cache flush button');
				await buttonInteraction.editReply({
					content: '❌ Something went wrong while processing the request.',
				});
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
): Promise<CacheStats> {
	const stats: CacheStats = {
		queryCache: { count: 0, size: 0 },
		externalPlaylistCache: { count: 0, size: 0 },
		opusCache: { count: 0, size: 0 },
	};

	const updateDisplay = async () => {
		try {
			const embed = createCacheStatsEmbed(stats);
			const actionRow = createActionRow(interaction.user.id === OWNER_ID);

			await interaction.editReply({
				embeds: [embed],
				components: [actionRow],
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

	return stats;
}

async function getRedisCacheStatsWithUpdates(
	pattern: string,
	onUpdate: (result: { count: number; size: number }) => void,
): Promise<void> {
	try {
		const stream = redis.scanStream({
			match: pattern,
			count: 100,
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

		const BATCH_SIZE = 50;

		for await (const entry of directory) {
			if (entry.isFile()) {
				try {
					const fileStat = await stat(join(opusCacheDirectory, entry.name));
					count++;
					size += fileStat.size;
					processedFiles++;

					if (processedFiles % BATCH_SIZE === 0) {
						onUpdate({ count, size });
						await new Promise((resolve) => setTimeout(resolve, 10));
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
	const row = new ActionRowBuilder<ButtonBuilder>();

	const buttons = [
		new ButtonBuilder()
			.setCustomId('flush_query_cache')
			.setLabel('Flush query cache')
			.setStyle(ButtonStyle.Danger)
			.setDisabled(!isOwner),
		new ButtonBuilder()
			.setCustomId('flush_external_playlist_cache')
			.setLabel('Flush playlist cache')
			.setStyle(ButtonStyle.Danger)
			.setDisabled(!isOwner),
	];

	row.addComponents(buttons);

	return row;
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
