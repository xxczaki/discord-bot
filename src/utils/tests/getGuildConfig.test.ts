import type { Channel, Client } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import getGuildConfig, {
	getHomeGuildId,
	getPlaylistsChannel,
	isHomeGuild,
} from '../getGuildConfig.ts';

const HOME_GUILD_ID = 'home-guild-id';
const FRIEND_GUILD_ID = 'friend-guild-id';
const DEBUG_CHANNEL_ID = 'debug-channel-id';

const GUILD_CONFIG = {
	[HOME_GUILD_ID]: {
		playlistsChannelId: 'home-playlists',
		ownerRoleId: 'home-owner-role',
	},
	[FRIEND_GUILD_ID]: {
		playlistsChannelId: 'friend-playlists',
	},
};

function createMockClient(
	channels: Record<string, Pick<Channel, 'id'> | { guildId?: string }>,
) {
	return {
		channels: { cache: new Map(Object.entries(channels)) },
	} as unknown as Client;
}

beforeEach(() => {
	vi.stubEnv('GUILD_CONFIG', JSON.stringify(GUILD_CONFIG));
	vi.stubEnv('BOT_DEBUG_CHANNEL_ID', DEBUG_CHANNEL_ID);
});

afterEach(() => {
	vi.unstubAllEnvs();
});

describe('getGuildConfig', () => {
	it('should return the config of a listed guild', () => {
		expect(getGuildConfig(FRIEND_GUILD_ID)).toEqual(
			GUILD_CONFIG[FRIEND_GUILD_ID],
		);
	});

	it('should return `null` for an unlisted guild', () => {
		expect(getGuildConfig('unknown-guild')).toBeNull();
	});

	it('should return `null` without a guild ID', () => {
		expect(getGuildConfig(null)).toBeNull();
	});
});

describe('getPlaylistsChannel', () => {
	it('should return the playlists channel of the given guild', () => {
		const friendChannel = { id: 'friend-playlists' };
		const client = createMockClient({
			'home-playlists': { id: 'home-playlists' },
			'friend-playlists': friendChannel,
		});

		expect(getPlaylistsChannel(client, FRIEND_GUILD_ID)).toBe(friendChannel);
	});

	it('should return `undefined` for an unconfigured guild', () => {
		const client = createMockClient({
			'home-playlists': { id: 'home-playlists' },
		});

		expect(getPlaylistsChannel(client, 'unknown-guild')).toBeUndefined();
	});
});

describe('home guild', () => {
	it('should resolve the home guild from the debug channel', () => {
		const client = createMockClient({
			[DEBUG_CHANNEL_ID]: { guildId: HOME_GUILD_ID },
		});

		expect(getHomeGuildId(client)).toBe(HOME_GUILD_ID);
		expect(isHomeGuild(client, HOME_GUILD_ID)).toBe(true);
		expect(isHomeGuild(client, FRIEND_GUILD_ID)).toBe(false);
	});

	it('should return `null` when the debug channel is not cached', () => {
		const client = createMockClient({});

		expect(getHomeGuildId(client)).toBeNull();
		expect(isHomeGuild(client, HOME_GUILD_ID)).toBe(false);
	});

	it('should return `null` when the debug channel is not in a guild', () => {
		const client = createMockClient({ [DEBUG_CHANNEL_ID]: {} });

		expect(getHomeGuildId(client)).toBeNull();
	});
});
