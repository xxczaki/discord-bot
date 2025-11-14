import { stat } from 'node:fs/promises';
import { EmbedBuilder } from 'discord.js';
import type { Track } from 'discord-player';
import prettyBytes from 'pretty-bytes';
import isObject from '../utils/isObject';
import getOpusCacheTrackPath from './getOpusCacheTrackPath';
import getTrackThumbnail from './getTrackThumbnail';
import isUrlSpotifyPlaylist from './isUrlSpotifyPlaylist';

const fileStatsCache = new Map<string, { size: number; timestamp: number }>();
const CACHE_DURATION_MS = 30_000;

async function createTrackEmbed(track: Track, description: string) {
	const embed = new EmbedBuilder()
		.setTitle(track.title)
		.setColor('Blue')
		.setDescription(description)
		.setThumbnail(getTrackThumbnail(track))
		.setURL(track.url)
		.setAuthor({ name: track.author })
		.setFields({ name: 'Duration', value: track.duration, inline: true });

	const trackQuery = isObject(track.metadata)
		? track.metadata.originalQuery
		: undefined;

	if (
		trackQuery &&
		typeof trackQuery === 'string' &&
		!isUrlSpotifyPlaylist(trackQuery)
	) {
		embed.addFields({
			name: 'Query',
			value: `\`${trackQuery}\``,
		});
	}

	if (!isObject(track.metadata)) {
		return embed;
	}

	if (track.metadata.isFromCache) {
		let footerText = '♻️ Streaming from the offline cache';

		try {
			const filePath = getOpusCacheTrackPath(track.url);
			const now = Date.now();

			let fileSize: number | undefined;

			const cached = fileStatsCache.get(filePath);

			if (cached && now - cached.timestamp < CACHE_DURATION_MS) {
				fileSize = cached.size;
			} else {
				const stats = await stat(filePath);
				fileSize = stats.size;
				fileStatsCache.set(filePath, { size: fileSize, timestamp: now });
			}

			footerText += ` (${prettyBytes(fileSize)})`;
		} catch {}

		embed.setFooter({
			text: footerText,
		});
	}

	if (isObject(track.metadata.bridge) && track.metadata.bridge?.url) {
		embed.addFields({
			name: 'Bridged URL',
			value: `[YouTube](${track.metadata.bridge.url})`,
			inline: true,
		});
	}

	return embed;
}

export default createTrackEmbed;
