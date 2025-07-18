import type {
	ChatInputCommandInteraction,
	GuildMember,
	StringSelectMenuInteraction,
	TextBasedChannel,
	VoiceBasedChannel,
} from 'discord.js';
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
} from 'discord.js';
import { beforeEach, expect, it, vi } from 'vitest';
import enqueuePlaylists from '../../utils/enqueuePlaylists';
import getEnvironmentVariable from '../../utils/getEnvironmentVariable';
import getPlaylists from '../../utils/getPlaylists';
import playlistsCommandHandler from '../playlists';

const EXAMPLE_PLAYLISTS_CHANNEL_ID = 'channel123';
const EXAMPLE_PLAYLISTS = {
	options: [
		new StringSelectMenuOptionBuilder()
			.setLabel('playlist1')
			.setDescription('2 songs')
			.setValue('playlist1'),
		new StringSelectMenuOptionBuilder()
			.setLabel('playlist2')
			.setDescription('1 song')
			.setValue('playlist2'),
	],
	totalPages: 1,
	currentPage: 0,
	totalItems: 2,
	rangeIndicator: 'P-P',
	hasMore: false,
};

vi.mock('../../utils/getEnvironmentVariable');
vi.mock('../../utils/getPlaylists');
vi.mock('../../utils/enqueuePlaylists');

const mockedGetEnvironmentVariable = vi.mocked(getEnvironmentVariable);
const mockedGetPlaylists = vi.mocked(getPlaylists);
const mockedEnqueuePlaylists = vi.mocked(enqueuePlaylists);

let mockInteraction: ChatInputCommandInteraction;
let mockChannel: TextBasedChannel;
let mockVoiceChannel: VoiceBasedChannel;
let mockResponse: {
	awaitMessageComponent: ReturnType<typeof vi.fn>;
	delete: ReturnType<typeof vi.fn>;
	edit: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
	vi.clearAllMocks();

	mockChannel = {
		isTextBased: () => true,
	} as TextBasedChannel;

	mockVoiceChannel = {} as VoiceBasedChannel;

	mockResponse = {
		awaitMessageComponent: vi.fn(),
		delete: vi.fn(),
		edit: vi.fn(),
	};

	mockInteraction = {
		client: {
			channels: {
				cache: {
					get: vi.fn().mockReturnValue(mockChannel),
				},
			},
		},
		member: {
			voice: {
				channel: mockVoiceChannel,
			},
		} as GuildMember,
		reply: vi.fn().mockResolvedValue(mockResponse),
	} as unknown as ChatInputCommandInteraction;

	mockedGetEnvironmentVariable.mockReturnValue(EXAMPLE_PLAYLISTS_CHANNEL_ID);
	mockedGetPlaylists.mockResolvedValue(EXAMPLE_PLAYLISTS);
});

it('should return early when channel is not found', async () => {
	mockInteraction.client.channels.cache.get = vi.fn().mockReturnValue(null);

	await playlistsCommandHandler(mockInteraction);

	expect(mockInteraction.reply).toHaveBeenCalledWith({
		content: 'Invalid playlists channel type!',
		flags: ['Ephemeral'],
	});
});

it('should return early when channel is not text-based', async () => {
	const nonTextChannel = {
		isTextBased: () => false,
	} as unknown as TextBasedChannel;

	mockInteraction.client.channels.cache.get = vi
		.fn()
		.mockReturnValue(nonTextChannel);

	await playlistsCommandHandler(mockInteraction);

	expect(mockInteraction.reply).toHaveBeenCalledWith({
		content: 'Invalid playlists channel type!',
		flags: ['Ephemeral'],
	});
});

it('should return early when user is not in a voice channel', async () => {
	const memberWithoutVoice = {
		voice: {
			channel: null,
		},
	} as GuildMember;

	mockInteraction.member = memberWithoutVoice;

	await playlistsCommandHandler(mockInteraction);

	expect(mockInteraction.reply).toHaveBeenCalledWith({
		content: 'You are not connected to a voice channel!',
		components: [],
		flags: ['Ephemeral'],
	});
});

it('should fetch channel using environment variable', async () => {
	mockResponse.awaitMessageComponent.mockResolvedValue({
		isButton: () => true,
	});

	await playlistsCommandHandler(mockInteraction);

	expect(mockedGetEnvironmentVariable).toHaveBeenCalledWith(
		'PLAYLISTS_CHANNEL_ID',
	);
	expect(mockInteraction.client.channels.cache.get).toHaveBeenCalledWith(
		EXAMPLE_PLAYLISTS_CHANNEL_ID,
	);
});

it('should fetch playlists from channel', async () => {
	mockResponse.awaitMessageComponent.mockResolvedValue({
		isButton: () => true,
	});

	await playlistsCommandHandler(mockInteraction);

	expect(mockedGetPlaylists).toHaveBeenCalledWith(mockChannel, 0);
});

it('should create select menu with correct configuration', async () => {
	mockResponse.awaitMessageComponent.mockResolvedValue({
		isButton: () => true,
	});

	await playlistsCommandHandler(mockInteraction);

	expect(mockInteraction.reply).toHaveBeenCalledWith({
		content: 'Loading playlists…',
		flags: ['Ephemeral'],
	});

	expect(mockResponse.edit).toHaveBeenCalledWith({
		content: 'Found 2 playlists',
		components: [expect.any(ActionRowBuilder), expect.any(ActionRowBuilder)],
	});

	const editCall = (mockResponse.edit as ReturnType<typeof vi.fn>).mock
		.calls[0][0];
	const selectRow = editCall.components[0];
	const buttonRow = editCall.components[1];

	const selectComponent = selectRow.components[0];

	expect(selectComponent).toBeInstanceOf(StringSelectMenuBuilder);
	expect(selectComponent.data.custom_id).toBe('playlistSelect');
	expect(selectComponent.data.placeholder).toBe('Select up to 5 entries');
	expect(selectComponent.data.min_values).toBe(1);
	expect(selectComponent.data.max_values).toBe(2);

	const buttonComponent = buttonRow.components[0]; // Cancel button is the only button when totalPages = 1

	expect(buttonComponent).toBeInstanceOf(ButtonBuilder);
	expect(buttonComponent.data.custom_id).toBe('cancel');
	expect(buttonComponent.data.label).toBe('Cancel');
	expect(buttonComponent.data.style).toBe(ButtonStyle.Secondary);
});

it('should delete response when cancel button is clicked', async () => {
	mockResponse.awaitMessageComponent.mockResolvedValue({
		isButton: () => true,
	});

	await playlistsCommandHandler(mockInteraction);

	expect(mockResponse.delete).toHaveBeenCalled();
	expect(mockedEnqueuePlaylists).not.toHaveBeenCalled();
});

it('should call `enqueuePlaylists` when select menu is used', async () => {
	const mockSelectMenuInteraction = {
		isButton: () => false,
		isStringSelectMenu: () => true,
	} as StringSelectMenuInteraction;

	mockResponse.awaitMessageComponent.mockResolvedValue(
		mockSelectMenuInteraction,
	);

	await playlistsCommandHandler(mockInteraction);

	expect(mockResponse.delete).toHaveBeenCalled();
	expect(mockedEnqueuePlaylists).toHaveBeenCalledWith(
		mockSelectMenuInteraction,
		mockVoiceChannel,
	);
});

it('should handle unexpected interaction type without error', async () => {
	const mockUnknownInteraction = {
		isButton: () => false,
		isStringSelectMenu: () => false,
	};

	mockResponse.awaitMessageComponent.mockResolvedValue(mockUnknownInteraction);

	await playlistsCommandHandler(mockInteraction);

	expect(mockResponse.delete).not.toHaveBeenCalled();
	expect(mockedEnqueuePlaylists).not.toHaveBeenCalled();
});

it('should handle empty playlists list gracefully', async () => {
	mockedGetPlaylists.mockResolvedValue({
		options: [],
		totalPages: 0,
		currentPage: 0,
		totalItems: 0,
		rangeIndicator: '',
		hasMore: false,
	});
	mockResponse.awaitMessageComponent.mockResolvedValue({
		isButton: () => true,
	});

	await playlistsCommandHandler(mockInteraction);

	expect(mockInteraction.reply).toHaveBeenCalledWith({
		content: 'No playlists found!',
		flags: ['Ephemeral'],
	});
});

it('should handle playlists fetch error', async () => {
	mockedGetPlaylists.mockRejectedValue(new Error('Fetch failed'));

	await expect(playlistsCommandHandler(mockInteraction)).rejects.toThrow(
		'Fetch failed',
	);
});

it('should show range information when there are 25+ playlists', async () => {
	const manyPlaylistsData = {
		options: Array.from({ length: 25 }, (_, i) =>
			new StringSelectMenuOptionBuilder()
				.setLabel(`playlist${i + 1}`)
				.setDescription('1 song')
				.setValue(`playlist${i + 1}`),
		),
		totalPages: 2,
		currentPage: 0,
		totalItems: 27,
		rangeIndicator: 'P-P',
		hasMore: true,
	};

	mockedGetPlaylists.mockResolvedValue(manyPlaylistsData);
	mockResponse.awaitMessageComponent.mockResolvedValue({
		isButton: () => true,
	});

	await playlistsCommandHandler(mockInteraction);

	expect(mockResponse.edit).toHaveBeenCalledWith({
		content: 'Found 27 playlists, showing 1-25',
		components: [expect.any(ActionRowBuilder), expect.any(ActionRowBuilder)],
	});
});

it('should show simple format when there are exactly 25 playlists on single page', async () => {
	const exactly25PlaylistsData = {
		options: Array.from({ length: 25 }, (_, i) =>
			new StringSelectMenuOptionBuilder()
				.setLabel(`playlist${i + 1}`)
				.setDescription('1 song')
				.setValue(`playlist${i + 1}`),
		),
		totalPages: 1,
		currentPage: 0,
		totalItems: 25,
		rangeIndicator: 'P-P',
		hasMore: false,
	};

	mockedGetPlaylists.mockResolvedValue(exactly25PlaylistsData);
	mockResponse.awaitMessageComponent.mockResolvedValue({
		isButton: () => true,
	});

	await playlistsCommandHandler(mockInteraction);

	expect(mockResponse.edit).toHaveBeenCalledWith({
		content: 'Found 25 playlists',
		components: [expect.any(ActionRowBuilder), expect.any(ActionRowBuilder)],
	});
});
