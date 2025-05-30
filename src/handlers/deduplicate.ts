import { type Track, useQueue } from 'discord-player';
import type { ChatInputCommandInteraction } from 'discord.js';
import isObject from '../utils/isObject';
import pluralize from '../utils/pluralize';

const ALGORITHMS = ['bridged', 'source'] as const;

const pluralizeDuplicates = pluralize('duplicate', 'duplicates');

export default async function deduplicateCommandHandler(
	interaction: ChatInputCommandInteraction,
) {
	const queue = useQueue();

	if (!queue) {
		return interaction.reply({
			content: 'The queue is empty.',
			flags: ['Ephemeral'],
		});
	}

	const algorithm = interaction.options.getString('algorithm', true);

	if (!ALGORITHMS.includes(algorithm as (typeof ALGORITHMS)[number])) {
		return interaction.reply({
			content: 'Incorrect deduplication algorithm specified, aborting…',
			flags: ['Ephemeral'],
		});
	}

	await interaction.reply('Searching for duplicates…');

	let fullQueue = [queue.currentTrack ?? [], ...queue.tracks.store].flat();

	switch (algorithm) {
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
	}
}

function getTrackUrl(track: Track, type: (typeof ALGORITHMS)[number]) {
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
	}
}
