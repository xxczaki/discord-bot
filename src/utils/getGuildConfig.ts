import type { Client } from 'discord.js';
import memoize from 'memoize';
import { z } from 'zod';
import getEnvironmentVariable from './getEnvironmentVariable';

const guildConfigSchema = z.object({
	playlistsChannelId: z.string().min(1),
	ownerRoleId: z.string().min(1).optional(),
});

const guildConfigMapSchema = z.record(z.string(), guildConfigSchema);

export type GuildConfig = z.infer<typeof guildConfigSchema>;

const parseGuildConfig = memoize((rawConfig: string) =>
	guildConfigMapSchema.parse(JSON.parse(rawConfig)),
);

export default function getGuildConfig(
	guildId: string | null | undefined,
): GuildConfig | null {
	if (!guildId) {
		return null;
	}

	const guildConfigMap = parseGuildConfig(
		getEnvironmentVariable('GUILD_CONFIG'),
	);

	return guildConfigMap[guildId] ?? null;
}

export function getPlaylistsChannel(
	client: Client,
	guildId: string | null | undefined,
) {
	const playlistsChannelId = getGuildConfig(guildId)?.playlistsChannelId;

	if (!playlistsChannelId) {
		return undefined;
	}

	return client.channels.cache.get(playlistsChannelId);
}

export function getHomeGuildId(client: Client): string | null {
	const debugChannel = client.channels.cache.get(
		getEnvironmentVariable('BOT_DEBUG_CHANNEL_ID'),
	);

	if (!debugChannel || !('guildId' in debugChannel)) {
		return null;
	}

	return debugChannel.guildId;
}

export function isHomeGuild(
	client: Client,
	guildId: string | null | undefined,
): boolean {
	const homeGuildId = getHomeGuildId(client);

	return homeGuildId !== null && homeGuildId === guildId;
}
