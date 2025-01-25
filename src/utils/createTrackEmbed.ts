import type { Track } from 'discord-player';
import { EmbedBuilder } from 'discord.js';

export default function createTrackEmbed(track: Track, description: string) {
	return new EmbedBuilder()
		.setTitle(track.title)
		.setDescription(description)
		.setURL(track.url)
		.setAuthor({ name: track.author })
		.setThumbnail(URL.canParse(track.thumbnail) ? track.thumbnail : null)
		.addFields([{ name: 'Duration', value: track.duration, inline: true }]);
}
