import type { Track } from 'discord-player';
import { EmbedBuilder } from 'discord.js';
import isObject from '../utils/isObject';
import getTrackThumbnail from './getTrackThumbnail';

export default function createTrackEmbed(
	track: Track,
	description: string,
	isCached?: boolean,
) {
	const embed = new EmbedBuilder()
		.setTitle(track.title)
		.setDescription(description)
		.setThumbnail(getTrackThumbnail(track))
		.setURL(track.url)
		.setAuthor({ name: track.author })
		.setFields({ name: 'Duration', value: track.duration, inline: true });

	if (!isObject(track.metadata) || !isObject(track.metadata.bridge)) {
		return embed;
	}

	if (track.metadata.bridge?.url) {
		embed.addFields({
			name: 'Bridged URL',
			value: `[YouTube](${track.metadata.bridge.url})`,
			inline: true,
		});
	}

	embed.addFields({
		name: 'Cached',
		value: isCached ? '✅' : '❌',
		inline: true,
	});

	return embed;
}
