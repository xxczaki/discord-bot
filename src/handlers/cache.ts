import { opendir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
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
import { DEFAULT_MESSAGE_COMPONENT_AWAIT_TIME_MS } from '../constants/miscellaneous.ts';
import { isHomeGuild } from '../utils/getGuildConfig.ts';
import LockdownManager from '../utils/lockdown.ts';
import logger from '../utils/logger.ts';
import { OpusCacheManager } from '../utils/OpusCacheManager.ts';
import pluralize from '../utils/pluralize.ts';
import redis from '../utils/redis.ts';
import reportError from '../utils/reportError.ts';

const opusCacheDirectory = OpusCacheManager.getDirectoryPath();

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
	correctedQueries: {
		count: number;
		size: number;
	};
}

export default async function cacheCommandHandler(
	interaction: ChatInputCommandInteraction,
) {
	await interaction.editReply('Loading cache statistics…');

	try {
		const usedButtons = new Set<string>();
		const lockdown = LockdownManager.getInstance();
		const canManageCache = (
			member: typeof interaction.member,
			guildId: string | null,
		) =>
			member !== null &&
			isHomeGuild(interaction.client, guildId) &&
			lockdown.isOwner(member, guildId);
		const isOwner = canManageCache(interaction.member, interaction.guildId);
		const actionRow = createActionRow(isOwner);
		let stats = await gatherCacheStatsWithLiveUpdates(
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
			const isButtonOwner = canManageCache(
				buttonInteraction.member,
				buttonInteraction.guildId,
			);

			if (!isButtonOwner) {
				await buttonInteraction.reply({
					content: 'Only the bot owner can use these buttons.',
					flags: ['Ephemeral'],
				});
				return;
			}

			try {
				if (buttonInteraction.deferred || buttonInteraction.replied) {
					return;
				}

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
						await deleteKeysMatching('discord-player:query-cache:*');
						break;
					case 'flush_external_playlist_cache':
						await deleteKeysMatching('external-playlist-cache:*');
						break;
					default:
						return;
				}

				stats = await gatherCacheStatsWithLiveUpdates(interaction, usedButtons);

				try {
					await interaction.editReply({
						embeds: [createCacheStatsEmbed(stats)],
						components:
							remainingActionRow.components.length > 0
								? [remainingActionRow]
								: [],
					});
				} catch (editError) {
					logger.error(editError, 'Failed to edit reply after cache flush');
				}
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
			content: 'Something went wrong while gathering cache statistics.',
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
		correctedQueries: { count: 0, size: 0 },
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
		getRedisCacheStatsWithUpdates(
			'discord-player:query-corrected:*',
			(result) => {
				stats.correctedQueries = result;
				updateDisplay();
			},
		),
	];

	await Promise.all(promises);

	await updateDisplay(true);

	return stats;
}

async function getRedisCacheStatsWithUpdates(
	pattern: string,
	onUpdate: (result: { count: number; size: number }) => void,
): Promise<void> {
	let count = 0;
	let size = 0;

	try {
		const stream = redis.scanStream({
			match: pattern,
			count: 200,
		});

		for await (const keys of stream as AsyncIterable<string[]>) {
			if (keys.length === 0) {
				continue;
			}

			try {
				const values = await redis.mget(keys);

				count += keys.length;
				size += values
					.filter((value) => value !== null)
					.reduce((total, value) => total + Buffer.byteLength(value), 0);

				onUpdate({ count, size });

				await setTimeout(25);
			} catch (error) {
				logger.error(
					error,
					`Failed to process Redis cache batch for pattern ${pattern}:`,
				);
			}
		}

		onUpdate({ count, size });
	} catch (error) {
		logger.error(error, `Failed to scan Redis cache for pattern ${pattern}:`);
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

					/* v8 ignore start */
					if (processedFiles % BATCH_SIZE === 0) {
						onUpdate({ count, size });
						await setTimeout(50);
					}
					/* v8 ignore stop */
				} catch (error) {
					logger.error(error, `Failed to stat file ${entry.name}:`);
				}
			}
		}

		onUpdate({ count, size });
	} catch (error) {
		logger.error(error, 'Failed to get Opus cache stats:');
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
	return new EmbedBuilder()
		.setTitle('Cache Statistics')
		.setColor('Blue')
		.setFields([
			{
				name: 'Query Cache',
				value: formatCacheField(
					stats.queryCache.count,
					stats.queryCache.size,
					'entry',
					'entries',
				),
				inline: true,
			},
			{
				name: 'External Playlist Cache',
				value: formatCacheField(
					stats.externalPlaylistCache.count,
					stats.externalPlaylistCache.size,
					'entry',
					'entries',
				),
				inline: true,
			},
			{
				name: 'Opus Cache',
				value: formatCacheField(
					stats.opusCache.count,
					stats.opusCache.size,
					'file',
					'files',
				),
				inline: true,
			},
			{
				name: 'Corrected Queries',
				value: formatCacheField(
					stats.correctedQueries.count,
					stats.correctedQueries.size,
					'query',
					'queries',
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

async function deleteKeysMatching(pattern: string): Promise<void> {
	const stream = redis.scanStream({
		match: pattern,
		count: 500,
	});

	for await (const keys of stream as AsyncIterable<string[]>) {
		if (keys.length === 0) {
			continue;
		}

		try {
			const pipeline = redis.pipeline();

			for (const key of keys) {
				pipeline.del(key);
			}

			await pipeline.exec();
			/* v8 ignore start */
		} catch (error) {
			reportError(
				error,
				`Failed to delete keys matching ${pattern} from Redis`,
			);
		}
		/* v8 ignore stop */
	}
}
