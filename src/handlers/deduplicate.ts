import type { ChatInputCommandInteraction } from 'discord.js';
import type { Track } from 'discord-player';
import isObject from '../utils/isObject';
import pluralize from '../utils/pluralize';
import useQueueWithValidation from '../utils/useQueueWithValidation';

const ALGORITHMS = ['bridged', 'source'] as const;

const pluralizeDuplicates = pluralize('duplicate', 'duplicates');

export default async function deduplicateCommandHandler(
	interaction: ChatInputCommandInteraction,
) {
	const queue = useQueueWithValidation(interaction, 'The queue is empty.');

	if (!queue) return;

	const algorithm = interaction.options.getString('algorithm', true);

	if (!ALGORITHMS.includes(algorithm as (typeof ALGORITHMS)[number])) {
		return interaction.reply({
			content: 'Incorrect deduplication algorithm specified, aborting…',
			flags: ['Ephemeral'],
		});
	}

	await interaction.reply('Searching for duplicates…');

	const fullQueue = [queue.currentTrack ?? [], ...queue.tracks.store].flat();

	switch (algorithm) {
		case 'bridged':
		case 'source': {
			const seenUrls = new Set<string>();
			const tracksToRemove: Track[] = [];

			for (const [index, track] of fullQueue.entries()) {
				const trackUrl = getTrackUrl(track, algorithm);

				if (seenUrls.has(trackUrl)) {
					if (index !== 0) {
						tracksToRemove.push(track);
					}
				} else {
					seenUrls.add(trackUrl);
				}
			}

			for (const track of tracksToRemove) {
				queue.removeTrack(track);
			}

			const removed = tracksToRemove.length;

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
