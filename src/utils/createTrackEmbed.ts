import { stat } from 'node:fs/promises';
import { EmbedBuilder } from 'discord.js';
import type { Track } from 'discord-player';
import prettyBytes from 'pretty-bytes';
import isObject from '../utils/isObject';
import getOpusCacheTrackPath from './getOpusCacheTrackPath';
import getTrackThumbnail from './getTrackThumbnail';

async function createTrackEmbed(track: Track, description: string) {
	const embed = new EmbedBuilder()
		.setTitle(track.title)
		.setDescription(description)
		.setThumbnail(getTrackThumbnail(track))
		.setURL(track.url)
		.setAuthor({ name: track.author })
		.setFields({ name: 'Duration', value: track.duration, inline: true });

	const trackQuery = isObject(track.metadata)
		? track.metadata.originalQuery
		: undefined;

	if (trackQuery && typeof trackQuery === 'string') {
		embed.addFields({
			name: 'Query',
			value: `\`${trackQuery}\``,
		});
	}

	if (!isObject(track.metadata)) {
		return embed;
	}

	if (track.metadata.isFromCache) {
		let footerText = '♻️ Streaming from an offline cache';

		try {
			const filePath = getOpusCacheTrackPath(track.url);
			const stats = await stat(filePath);

			footerText += ` (${prettyBytes(stats.size)})`;
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
