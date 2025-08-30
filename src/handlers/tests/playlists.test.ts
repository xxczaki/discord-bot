import type {
	ChatInputCommandInteraction,
	GuildMember,
	VoiceBasedChannel,
} from 'discord.js';
import { beforeEach, expect, it, vi } from 'vitest';
import enqueuePlaylists from '../../utils/enqueuePlaylists';
import playlistsCommandHandler from '../playlists';

vi.mock('../../utils/enqueuePlaylists');

const mockEnqueuePlaylists = vi.mocked(enqueuePlaylists);

beforeEach(() => {
	vi.clearAllMocks();
});

it('should return early when user is not in a voice channel', async () => {
	const mockInteraction = {
		member: {
			voice: {
				channel: null,
			},
		} as GuildMember,
		reply: vi.fn(),
		options: {
			getString: vi.fn(),
		},
	} as unknown as ChatInputCommandInteraction;

	await playlistsCommandHandler(mockInteraction);

	expect(mockInteraction.reply).toHaveBeenCalledWith({
		content: 'You are not connected to a voice channel!',
		flags: ['Ephemeral'],
	});
});

it('should return early when no playlists are selected', async () => {
	const mockVoiceChannel = {} as VoiceBasedChannel;
	const mockInteraction = {
		member: {
			voice: {
				channel: mockVoiceChannel,
			},
		} as GuildMember,
		reply: vi.fn(),
		options: {
			getString: vi.fn().mockReturnValue(null),
		},
	} as unknown as ChatInputCommandInteraction;

	await playlistsCommandHandler(mockInteraction);

	expect(mockInteraction.reply).toHaveBeenCalledWith({
		content: 'No playlists selected!',
		flags: ['Ephemeral'],
	});
});

it('should call enqueuePlaylists with selected playlists', async () => {
	const mockVoiceChannel = {} as VoiceBasedChannel;
	const mockInteraction = {
		member: {
			voice: {
				channel: mockVoiceChannel,
			},
		} as GuildMember,
		reply: vi.fn(),
		options: {
			getString: vi
				.fn()
				.mockReturnValueOnce('playlist1')
				.mockReturnValueOnce('playlist2')
				.mockReturnValueOnce(null)
				.mockReturnValueOnce(null)
				.mockReturnValueOnce(null),
		},
	} as unknown as ChatInputCommandInteraction;

	mockEnqueuePlaylists.mockResolvedValue(undefined);

	await playlistsCommandHandler(mockInteraction);

	expect(mockInteraction.options.getString).toHaveBeenCalledWith('playlist1');
	expect(mockInteraction.options.getString).toHaveBeenCalledWith('playlist2');
	expect(mockInteraction.options.getString).toHaveBeenCalledWith('playlist3');
	expect(mockInteraction.options.getString).toHaveBeenCalledWith('playlist4');
	expect(mockInteraction.options.getString).toHaveBeenCalledWith('playlist5');

	expect(mockEnqueuePlaylists).toHaveBeenCalledWith(
		mockInteraction,
		mockVoiceChannel,
		['playlist1', 'playlist2'],
	);
});

it('should handle single playlist selection', async () => {
	const mockVoiceChannel = {} as VoiceBasedChannel;
	const mockInteraction = {
		member: {
			voice: {
				channel: mockVoiceChannel,
			},
		} as GuildMember,
		reply: vi.fn(),
		options: {
			getString: vi
				.fn()
				.mockReturnValueOnce('single-playlist')
				.mockReturnValue(null),
		},
	} as unknown as ChatInputCommandInteraction;

	mockEnqueuePlaylists.mockResolvedValue(undefined);

	await playlistsCommandHandler(mockInteraction);

	expect(mockEnqueuePlaylists).toHaveBeenCalledWith(
		mockInteraction,
		mockVoiceChannel,
		['single-playlist'],
	);
});

it('should handle all five playlists selected', async () => {
	const mockVoiceChannel = {} as VoiceBasedChannel;
	const mockInteraction = {
		member: {
			voice: {
				channel: mockVoiceChannel,
			},
		} as GuildMember,
		reply: vi.fn(),
		options: {
			getString: vi
				.fn()
				.mockReturnValueOnce('playlist1')
				.mockReturnValueOnce('playlist2')
				.mockReturnValueOnce('playlist3')
				.mockReturnValueOnce('playlist4')
				.mockReturnValueOnce('playlist5'),
		},
	} as unknown as ChatInputCommandInteraction;

	mockEnqueuePlaylists.mockResolvedValue(undefined);

	await playlistsCommandHandler(mockInteraction);

	expect(mockEnqueuePlaylists).toHaveBeenCalledWith(
		mockInteraction,
		mockVoiceChannel,
		['playlist1', 'playlist2', 'playlist3', 'playlist4', 'playlist5'],
	);
});

it('should handle mixed null and valid playlists', async () => {
	const mockVoiceChannel = {} as VoiceBasedChannel;
	const mockInteraction = {
		member: {
			voice: {
				channel: mockVoiceChannel,
			},
		} as GuildMember,
		reply: vi.fn(),
		options: {
			getString: vi
				.fn()
				.mockReturnValueOnce('playlist1')
				.mockReturnValueOnce(null)
				.mockReturnValueOnce('playlist3')
				.mockReturnValueOnce(null)
				.mockReturnValueOnce('playlist5'),
		},
	} as unknown as ChatInputCommandInteraction;

	mockEnqueuePlaylists.mockResolvedValue(undefined);

	await playlistsCommandHandler(mockInteraction);

	expect(mockInteraction.options.getString).toHaveBeenCalledTimes(5);
	expect(mockEnqueuePlaylists).toHaveBeenCalledWith(
		mockInteraction,
		mockVoiceChannel,
		['playlist1', 'playlist3', 'playlist5'],
	);
});

it('should handle enqueuePlaylists throwing an error', async () => {
	const mockVoiceChannel = {} as VoiceBasedChannel;
	const mockInteraction = {
		member: {
			voice: {
				channel: mockVoiceChannel,
			},
		} as GuildMember,
		reply: vi.fn(),
		options: {
			getString: vi.fn().mockReturnValueOnce('playlist1').mockReturnValue(null),
		},
	} as unknown as ChatInputCommandInteraction;

	const error = new Error('Enqueue failed');
	mockEnqueuePlaylists.mockRejectedValue(error);

	await expect(playlistsCommandHandler(mockInteraction)).rejects.toThrow(
		'Enqueue failed',
	);
});
