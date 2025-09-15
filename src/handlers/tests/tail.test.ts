import type {
	ChatInputCommandInteraction,
	GuildMember,
	VoiceBasedChannel,
} from 'discord.js';
import { beforeEach, expect, it, vi } from 'vitest';
import enqueuePlaylistSlice from '../../utils/enqueuePlaylistSlice';
import tailCommandHandler from '../tail';

vi.mock('../../utils/enqueuePlaylistSlice');

const mockEnqueuePlaylistSlice = vi.mocked(enqueuePlaylistSlice);

beforeEach(() => {
	vi.clearAllMocks();
});

function createMockVoiceChannel(): VoiceBasedChannel {
	return {
		id: 'voice-channel-123',
		name: 'General',
	} as VoiceBasedChannel;
}

function createMockInteraction(
	playlist = 'recent-additions',
	count = 5,
	hasVoiceChannel = true,
): ChatInputCommandInteraction {
	return {
		member: {
			voice: {
				channel: hasVoiceChannel ? createMockVoiceChannel() : null,
			},
		} as GuildMember,
		options: {
			getString: vi.fn().mockReturnValue(playlist),
			getInteger: vi.fn().mockReturnValue(count),
		},
		reply: vi.fn(),
	} as unknown as ChatInputCommandInteraction;
}

it('should return early when user is not in a voice channel', async () => {
	const mockInteraction = createMockInteraction('recent-additions', 5, false);

	await tailCommandHandler(mockInteraction);

	expect(mockInteraction.reply).toHaveBeenCalledWith({
		content: 'You are not connected to a voice channel!',
		flags: ['Ephemeral'],
	});

	expect(mockEnqueuePlaylistSlice).not.toHaveBeenCalled();
});

it('should call enqueuePlaylistSlice with correct parameters', async () => {
	const mockInteraction = createMockInteraction('recent-rock', 8);
	const mockVoiceChannel = createMockVoiceChannel();

	mockEnqueuePlaylistSlice.mockResolvedValue(undefined);

	await tailCommandHandler(mockInteraction);

	expect(mockInteraction.options.getString).toHaveBeenCalledWith(
		'playlist',
		true,
	);
	expect(mockInteraction.options.getInteger).toHaveBeenCalledWith(
		'count',
		true,
	);

	expect(mockEnqueuePlaylistSlice).toHaveBeenCalledWith(
		mockInteraction,
		mockVoiceChannel,
		'recent-rock',
		'tail',
		8,
	);

	expect(mockInteraction.reply).not.toHaveBeenCalled();
});

it('should handle minimum count value', async () => {
	const mockInteraction = createMockInteraction('newest-songs', 1);
	const mockVoiceChannel = createMockVoiceChannel();

	mockEnqueuePlaylistSlice.mockResolvedValue(undefined);

	await tailCommandHandler(mockInteraction);

	expect(mockEnqueuePlaylistSlice).toHaveBeenCalledWith(
		mockInteraction,
		mockVoiceChannel,
		'newest-songs',
		'tail',
		1,
	);
});

it('should handle maximum count value', async () => {
	const mockInteraction = createMockInteraction('massive-collection', 100);
	const mockVoiceChannel = createMockVoiceChannel();

	mockEnqueuePlaylistSlice.mockResolvedValue(undefined);

	await tailCommandHandler(mockInteraction);

	expect(mockEnqueuePlaylistSlice).toHaveBeenCalledWith(
		mockInteraction,
		mockVoiceChannel,
		'massive-collection',
		'tail',
		100,
	);
});

it('should propagate errors from enqueuePlaylistSlice', async () => {
	const mockInteraction = createMockInteraction('broken-playlist', 5);
	const error = new Error('Failed to process playlist tail');

	mockEnqueuePlaylistSlice.mockRejectedValue(error);

	await expect(tailCommandHandler(mockInteraction)).rejects.toThrow(
		'Failed to process playlist tail',
	);
});

it('should handle special characters in playlist name', async () => {
	const playlistName = 'latest-2024_additions-v2';
	const mockInteraction = createMockInteraction(playlistName, 12);
	const mockVoiceChannel = createMockVoiceChannel();

	mockEnqueuePlaylistSlice.mockResolvedValue(undefined);

	await tailCommandHandler(mockInteraction);

	expect(mockEnqueuePlaylistSlice).toHaveBeenCalledWith(
		mockInteraction,
		mockVoiceChannel,
		playlistName,
		'tail',
		12,
	);
});

it('should work with different voice channel types', async () => {
	const mockStageChannel = {
		id: 'stage-channel-789',
		name: 'Concert Hall',
		type: 13, // ChannelType.GuildStageVoice
	} as VoiceBasedChannel;

	const mockInteraction = {
		member: {
			voice: {
				channel: mockStageChannel,
			},
		} as GuildMember,
		options: {
			getString: vi.fn().mockReturnValue('concert-setlist'),
			getInteger: vi.fn().mockReturnValue(6),
		},
		reply: vi.fn(),
	} as unknown as ChatInputCommandInteraction;

	mockEnqueuePlaylistSlice.mockResolvedValue(undefined);

	await tailCommandHandler(mockInteraction);

	expect(mockEnqueuePlaylistSlice).toHaveBeenCalledWith(
		mockInteraction,
		mockStageChannel,
		'concert-setlist',
		'tail',
		6,
	);
});

it('should handle edge case of zero count gracefully', async () => {
	// Note: This shouldn't happen due to Discord's minValue validation,
	// but testing edge cases is good practice
	const mockInteraction = createMockInteraction('test-playlist', 0);
	const mockVoiceChannel = createMockVoiceChannel();

	mockEnqueuePlaylistSlice.mockResolvedValue(undefined);

	await tailCommandHandler(mockInteraction);

	expect(mockEnqueuePlaylistSlice).toHaveBeenCalledWith(
		mockInteraction,
		mockVoiceChannel,
		'test-playlist',
		'tail',
		0,
	);
});

it('should handle various playlist naming conventions', async () => {
	const testCases = [
		'snake_case_playlist',
		'kebab-case-playlist',
		'camelCasePlaylist',
		'PascalCasePlaylist',
		'UPPERCASE_PLAYLIST',
		'mixed_Case-Playlist123',
	];

	for (const playlistName of testCases) {
		const mockInteraction = createMockInteraction(playlistName, 5);
		const mockVoiceChannel = createMockVoiceChannel();

		mockEnqueuePlaylistSlice.mockResolvedValue(undefined);

		await tailCommandHandler(mockInteraction);

		expect(mockEnqueuePlaylistSlice).toHaveBeenCalledWith(
			mockInteraction,
			mockVoiceChannel,
			playlistName,
			'tail',
			5,
		);

		vi.clearAllMocks(); // Clear between iterations
		mockEnqueuePlaylistSlice.mockResolvedValue(undefined);
	}
});
