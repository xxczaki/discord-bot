import { Client } from 'discord.js';
import {
	onBeforeCreateStream,
	onStreamExtracted,
	Player,
} from 'discord-player';
import { beforeEach, expect, it, vi } from 'vitest';
import getInitializedPlayer from '../initializePlayer';
import { RedisQueryCache } from '../RedisQueryCache';

vi.mock('discord.js', () => ({
	Client: vi.fn(() => ({ intents: [] })),
}));

vi.mock('discord-player', () => ({
	Player: vi.fn(() => ({
		extractors: {
			register: vi.fn().mockResolvedValue(undefined),
			loadMulti: vi.fn().mockResolvedValue(undefined),
		},
	})),
	onBeforeCreateStream: vi.fn(),
	onStreamExtracted: vi.fn(),
	InterceptedStream: vi.fn(() => ({
		interceptors: {
			add: vi.fn(),
		},
	})),
	AudioFilters: {
		defineBulk: vi.fn(),
	},
}));

vi.mock('discord-player-youtubei', () => ({
	YoutubeiExtractor: vi.fn(),
}));

vi.mock('discord-player-spotify', () => ({
	SpotifyExtractor: vi.fn(),
}));

vi.mock('node:fs', () => ({
	createReadStream: vi.fn(),
	createWriteStream: vi.fn(),
	existsSync: vi.fn(),
}));

vi.mock('./RedisQueryCache', () => ({
	RedisQueryCache: vi.fn(),
}));

vi.mock('./defineCustomFilters', () => ({
	default: vi.fn(),
}));

vi.mock('./getOpusCacheTrackPath', () => ({
	default: vi.fn(() => '/cache/path'),
}));

let mockClient: Client;

beforeEach(() => {
	vi.clearAllMocks();
	mockClient = new Client({ intents: [] });
});

it('should create a new player instance with Redis query cache', async () => {
	const player = await getInitializedPlayer(mockClient);

	expect(Player).toHaveBeenCalledWith(mockClient, {
		queryCache: expect.any(RedisQueryCache),
	});
	expect(player).toBeDefined();
	expect(onBeforeCreateStream).toHaveBeenCalledWith(expect.any(Function));
	expect(onStreamExtracted).toHaveBeenCalledWith(expect.any(Function));
});

it('should return existing player instance if already initialized', async () => {
	const player1 = await getInitializedPlayer(mockClient);
	vi.clearAllMocks();
	const player2 = await getInitializedPlayer(mockClient);

	expect(Player).not.toHaveBeenCalled();
	expect(player1).toBe(player2);
});
