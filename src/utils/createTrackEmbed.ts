import { type Track, serialize } from 'discord-player';
import { EmbedBuilder } from 'discord.js';
import memoize from 'memoize';
import isObject from '../utils/isObject';
import getTrackThumbnail from './getTrackThumbnail';

function createTrackEmbed(track: Track, description: string) {
	const embed = new EmbedBuilder()
		.setTitle(track.title)
		.setDescription(description)
		.setThumbnail(getTrackThumbnail(track))
		.setURL(track.url)
		.setAuthor({ name: track.author })
		.setFields({ name: 'Duration', value: track.duration, inline: true });

	if (!isObject(track.metadata)) {
		return embed;
	}

	if (track.metadata.isFromCache) {
		embed.setFooter({
			text: '♻️ Streaming from an offline cache',
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

export default memoize(createTrackEmbed, {
	cacheKey: ([track]) => serialize(track),
});
