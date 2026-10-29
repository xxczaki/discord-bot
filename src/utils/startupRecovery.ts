import type {
	Client,
	Guild,
	InteractionEditReplyOptions,
	InteractionReplyOptions,
} from 'discord.js';
import type { Player } from 'discord-player';
import enqueueTracks from './enqueueTracks';
import getEnvironmentVariable from './getEnvironmentVariable';
import logger from './logger';
import { QueueRecoveryService } from './QueueRecoveryService';
import redis from './redis';

const SHUTDOWN_REASON_KEY = 'discord-bot:shutdown-reason';

export default async function performStartupRecovery(
	client: Client,
	player: Player,
): Promise<void> {
	try {
		const shutdownReason = await redis.get(SHUTDOWN_REASON_KEY);
		const isGracefulShutdown = shutdownReason === 'graceful';

		if (isGracefulShutdown) {
			await redis.del(SHUTDOWN_REASON_KEY);
		}

		await Promise.all(
			client.guilds.cache.map((guild) =>
				recoverGuildQueue(client, player, guild, isGracefulShutdown),
			),
		);
	} catch (error) {
		logger.error(error, 'Startup recovery failed');
	}
}

async function recoverGuildQueue(
	client: Client,
	player: Player,
	guild: Guild,
	isGracefulShutdown: boolean,
): Promise<void> {
	try {
		const queueRecoveryService = QueueRecoveryService.getInstance();
		const { tracks, progress, channelId } =
			await queueRecoveryService.getContents(player, guild.id);

		if (tracks.length === 0) {
			return;
		}

		const previousChannel = channelId
			? client.channels.cache.get(channelId)
			: null;
		const debugChannel = client.channels.cache.get(
			getEnvironmentVariable('BOT_DEBUG_CHANNEL_ID'),
		);
		const recoveryChannel = previousChannel?.isSendable()
			? previousChannel
			: debugChannel;

		if (!recoveryChannel?.isSendable()) {
			return;
		}

		if (!isGracefulShutdown) {
			await recoveryChannel.send(
				'Found a saved queue from a previous session. Use `/recover` to restore it.',
			);
			return;
		}

		if (!client.user) {
			return;
		}

		const voiceChannel = guild.channels.cache.find((channel) => {
			if (!channel.isVoiceBased()) return false;
			return channel.members.filter((member) => !member.user.bot).size > 0;
		});

		if (!voiceChannel?.isVoiceBased()) {
			return;
		}

		const message = await recoveryChannel.send('Starting auto-recovery…');

		const messageHandler = (
			options: InteractionEditReplyOptions | InteractionReplyOptions,
		) => {
			if (typeof options === 'string') {
				return message.edit(options);
			}

			const { flags: _flags, ...messageOptions } = options;

			return message.edit(messageOptions);
		};

		await enqueueTracks({
			tracks,
			progress,
			voiceChannel,
			interaction: {
				editReply: messageHandler,
				reply: messageHandler,
				user: client.user,
				channel: recoveryChannel,
			},
		});
	} catch (error) {
		logger.error(error, `Startup recovery failed for guild ${guild.id}`);
	}
}
