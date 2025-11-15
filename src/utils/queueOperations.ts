import type { GuildQueue, Track } from 'discord-player';

/**
 * Optimized pattern matcher for track filtering
 */
export class TrackMatcher {
	private readonly artistLower?: string;
	private readonly titleLower?: string;

	constructor(artistPattern?: string, titlePattern?: string) {
		// Pre-lowercase patterns for performance
		this.artistLower = artistPattern?.toLowerCase();
		this.titleLower = titlePattern?.toLowerCase();
	}

	matches(track: Track): boolean {
		const artistMatches = this.artistLower
			? track.author.toLowerCase().includes(this.artistLower)
			: true;
		const titleMatches = this.titleLower
			? track.title.toLowerCase().includes(this.titleLower)
			: true;

		return artistMatches && titleMatches;
	}
}

export interface RemoveTracksResult {
	success: boolean;
	removedCount: number;
	removedFromQueue: number;
	skippedCurrent: boolean;
}

/**
 * Remove tracks matching a pattern from the queue
 * @returns Result object with counts of removed tracks
 */
export function removeTracksByPattern(
	queue: GuildQueue,
	artistPattern?: string,
	titlePattern?: string,
): RemoveTracksResult {
	const matcher = new TrackMatcher(artistPattern, titlePattern);
	const tracks = queue.tracks.toArray();
	const currentTrack = queue.currentTrack;

	// Filter tracks to remove in one pass
	const tracksToRemove = tracks.filter((track) => matcher.matches(track));

	// Check if current track matches
	const shouldSkipCurrent = currentTrack
		? matcher.matches(currentTrack)
		: false;

	// Remove tracks from queue
	for (const track of tracksToRemove) {
		queue.removeTrack(track);
	}

	// Skip current track if it matches
	if (shouldSkipCurrent) {
		queue.node.skip();
	}

	return {
		success: true,
		removedCount: tracksToRemove.length + (shouldSkipCurrent ? 1 : 0),
		removedFromQueue: tracksToRemove.length,
		skippedCurrent: shouldSkipCurrent,
	};
}

export interface MoveTracksResult {
	success: boolean;
	movedCount: number;
}

/**
 * Move tracks matching a pattern to a specific position
 * @returns Result object with count of moved tracks
 */
export function moveTracksByPattern(
	queue: GuildQueue,
	artistPattern: string | undefined,
	titlePattern: string | undefined,
	position: number,
): MoveTracksResult {
	const matcher = new TrackMatcher(artistPattern, titlePattern);
	const tracks = queue.tracks.toArray();

	// Find matching tracks with their original indices
	const tracksToMove: { track: Track; originalIndex: number }[] = [];
	for (const [index, track] of tracks.entries()) {
		if (matcher.matches(track)) {
			tracksToMove.push({ track, originalIndex: index });
		}
	}

	if (tracksToMove.length === 0) {
		throw new Error('No tracks found matching the criteria');
	}

	// Calculate target position
	const targetPos = position === -1 ? tracks.length - 1 : position;

	// Move tracks in the correct order based on target position
	if (position === 0 || position === -1) {
		// When moving to start or end, reverse order to maintain relative positions
		for (let index = tracksToMove.length - 1; index >= 0; index--) {
			const { track } = tracksToMove[index];
			queue.moveTrack(track, targetPos);
		}
	} else {
		// For middle positions, move in forward order
		for (const { track } of tracksToMove) {
			queue.moveTrack(track, targetPos);
		}
	}

	return {
		success: true,
		movedCount: tracksToMove.length,
	};
}

export interface SkipTrackResult {
	success: boolean;
}

/**
 * Skip the currently playing track
 */
export function skipCurrentTrack(queue: GuildQueue): SkipTrackResult {
	queue.node.skip();
	return { success: true };
}

export interface PausePlaybackResult {
	success: boolean;
	wasPaused: boolean;
}

/**
 * Pause playback
 */
export function pausePlayback(queue: GuildQueue): PausePlaybackResult {
	const wasPaused = queue.node.isPaused();
	queue.node.setPaused(true);
	return { success: true, wasPaused };
}

export interface ResumePlaybackResult {
	success: boolean;
}

/**
 * Resume playback
 */
export function resumePlayback(queue: GuildQueue): ResumePlaybackResult {
	queue.node.setPaused(false);
	return { success: true };
}

export interface SetVolumeResult {
	success: boolean;
	volume: number;
}

/**
 * Set playback volume
 */
export function setVolume(queue: GuildQueue, volume: number): SetVolumeResult {
	queue.node.setVolume(volume);
	return { success: true, volume };
}

export interface DeduplicateQueueResult {
	success: boolean;
	removedCount: number;
}

/**
 * Remove duplicate tracks from the queue
 */
export function deduplicateQueue(queue: GuildQueue): DeduplicateQueueResult {
	const fullQueue = [queue.currentTrack ?? [], ...queue.tracks.store].flat();
	const seenUrls = new Set<string>();
	const tracksToRemove: Track[] = [];

	for (const [index, track] of fullQueue.entries()) {
		const trackUrl = track.url;

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

	return {
		success: true,
		removedCount: tracksToRemove.length,
	};
}
