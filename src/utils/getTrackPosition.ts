import type { GuildQueue, Track } from 'discord-player';

export default function getTrackPosition(
	queue: GuildQueue<unknown> | null,
	track: Track<unknown>,
) {
	if (!queue) {
		return 0;
	}

	const match = queue.tracks.find(({ id }) => id === track.id);

	if (!match) {
		return 0;
	}

	const index = queue.tracks.data.indexOf(match);

	return index;
}
