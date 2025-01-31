import { type Track, useQueue } from 'discord-player';
import type { CacheType, ChatInputCommandInteraction } from 'discord.js';
import Fuse from 'fuse.js';
import isObject from '../utils/isObject';
import pluralize from '../utils/pluralize';

const ALGORITHMS = ['fuzzy', 'bridged', 'source'] as const;

const pluralizeDuplicates = pluralize('duplicate', 'duplicates');

export default async function deduplicateCommandHandler(
	interaction: ChatInputCommandInteraction<CacheType>,
) {
	const queue = useQueue();

	if (!queue) {
		return interaction.reply('The queue is empty.');
	}

	const algorithm = interaction.options.getString('algorithm', true);

	if (!ALGORITHMS.includes(algorithm as (typeof ALGORITHMS)[number])) {
		return interaction.reply(
			'Incorrect deduplication algorithm specified, aborting…',
		);
	}

	await interaction.deferReply();

	let fullQueue = [queue.currentTrack ?? [], ...queue.tracks.store].flat();

	switch (algorithm) {
		case 'fuzzy': {
			const fuse = new Fuse(fullQueue, {
				keys: ['title'],
				threshold: 0.05,
			});

			let removed = 0;

			for (const track of fullQueue) {
				const matches = fuse.search(track.title);

				if (matches.length < 1) {
					continue;
				}

				for (const match of matches) {
					if (match.refIndex === 0) {
						continue;
					}

					queue.removeTrack(match.item);
					removed++;

					fuse.removeAt(match.refIndex);
				}
			}

			if (removed === 0) {
				return interaction.editReply('No duplicates were found.');
			}

			return interaction.editReply(
				pluralizeDuplicates`Removed ${removed} ${null}.`,
			);
		}
		case 'bridged':
		case 'source': {
			let removed = 0;

			for (const [index, track] of fullQueue.entries()) {
				if (
					fullQueue.filter(
						(nextTrack) =>
							getTrackUrl(nextTrack, algorithm) ===
							getTrackUrl(track, algorithm),
					).length > 1
				) {
					if (index === 0) {
						continue;
					}

					queue.removeTrack(track);
					removed++;

					fullQueue = [queue.currentTrack ?? [], ...queue.tracks.store].flat();
				}
			}

			if (removed === 0) {
				return interaction.editReply('No duplicates were found.');
			}

			return interaction.editReply(
				pluralizeDuplicates`Removed ${removed} ${null}.`,
			);
		}
		default:
			return interaction.editReply(
				'Incorrect deduplication algorithm specified, aborting…',
			);
	}
}

function getTrackUrl(
	track: Track,
	type: Exclude<(typeof ALGORITHMS)[number], 'fuzzy'>,
) {
	switch (type) {
		case 'source':
			return track.url;
		case 'bridged': {
			if (
				isObject(track.metadata) &&
				isObject(track.metadata.bridge) &&
				typeof track.metadata.bridge.url === 'string' &&
				URL.canParse(track.metadata.bridge.url)
			) {
				return track.metadata.bridge.url;
			}

			return track.url;
		}
		default:
			throw new TypeError('Invalid track URL type');
	}
}
