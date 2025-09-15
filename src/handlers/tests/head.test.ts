import type {
	ChatInputCommandInteraction,
	GuildMember,
	VoiceBasedChannel,
} from 'discord.js';
import { beforeEach, expect, it, vi } from 'vitest';
import enqueuePlaylistSlice from '../../utils/enqueuePlaylistSlice';
import headCommandHandler from '../head';

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
	playlist = 'my-favorites',
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
	const mockInteraction = createMockInteraction('my-favorites', 5, false);

	await headCommandHandler(mockInteraction);

	expect(mockInteraction.reply).toHaveBeenCalledWith({
		content: 'You are not connected to a voice channel!',
		flags: ['Ephemeral'],
	});

	expect(mockEnqueuePlaylistSlice).not.toHaveBeenCalled();
});

it('should call enqueuePlaylistSlice with correct parameters', async () => {
	const mockInteraction = createMockInteraction('rock-classics', 10);
	const mockVoiceChannel = createMockVoiceChannel();

	mockEnqueuePlaylistSlice.mockResolvedValue(undefined);

	await headCommandHandler(mockInteraction);

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
		'rock-classics',
		'head',
		10,
	);

	expect(mockInteraction.reply).not.toHaveBeenCalled();
});

it('should handle minimum count value', async () => {
	const mockInteraction = createMockInteraction('pop-hits', 1);
	const mockVoiceChannel = createMockVoiceChannel();

	mockEnqueuePlaylistSlice.mockResolvedValue(undefined);

	await headCommandHandler(mockInteraction);

	expect(mockEnqueuePlaylistSlice).toHaveBeenCalledWith(
		mockInteraction,
		mockVoiceChannel,
		'pop-hits',
		'head',
		1,
	);
});

it('should handle maximum count value', async () => {
	const mockInteraction = createMockInteraction('huge-playlist', 100);
	const mockVoiceChannel = createMockVoiceChannel();

	mockEnqueuePlaylistSlice.mockResolvedValue(undefined);

	await headCommandHandler(mockInteraction);

	expect(mockEnqueuePlaylistSlice).toHaveBeenCalledWith(
		mockInteraction,
		mockVoiceChannel,
		'huge-playlist',
		'head',
		100,
	);
});

it('should propagate errors from enqueuePlaylistSlice', async () => {
	const mockInteraction = createMockInteraction('error-playlist', 5);
	const error = new Error('Playlist processing failed');

	mockEnqueuePlaylistSlice.mockRejectedValue(error);

	await expect(headCommandHandler(mockInteraction)).rejects.toThrow(
		'Playlist processing failed',
	);
});

it('should handle special characters in playlist name', async () => {
	const playlistName = 'my-playlist-with-special-chars_123';
	const mockInteraction = createMockInteraction(playlistName, 7);
	const mockVoiceChannel = createMockVoiceChannel();

	mockEnqueuePlaylistSlice.mockResolvedValue(undefined);

	await headCommandHandler(mockInteraction);

	expect(mockEnqueuePlaylistSlice).toHaveBeenCalledWith(
		mockInteraction,
		mockVoiceChannel,
		playlistName,
		'head',
		7,
	);
});

it('should work with different voice channel types', async () => {
	const mockStageChannel = {
		id: 'stage-channel-456',
		name: 'Music Stage',
		type: 13, // ChannelType.GuildStageVoice
	} as VoiceBasedChannel;

	const mockInteraction = {
		member: {
			voice: {
				channel: mockStageChannel,
			},
		} as GuildMember,
		options: {
			getString: vi.fn().mockReturnValue('stage-playlist'),
			getInteger: vi.fn().mockReturnValue(3),
		},
		reply: vi.fn(),
	} as unknown as ChatInputCommandInteraction;

	mockEnqueuePlaylistSlice.mockResolvedValue(undefined);

	await headCommandHandler(mockInteraction);

	expect(mockEnqueuePlaylistSlice).toHaveBeenCalledWith(
		mockInteraction,
		mockStageChannel,
		'stage-playlist',
		'head',
		3,
	);
});
