import type {
	Client,
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
		const debugChannel = client.channels.cache.get(
			getEnvironmentVariable('BOT_DEBUG_CHANNEL_ID'),
		);

		const shutdownReason = await redis.get(SHUTDOWN_REASON_KEY);
		const queueRecoveryService = QueueRecoveryService.getInstance();
		const { tracks, progress, channelId } =
			await queueRecoveryService.getContents(player);

		if (shutdownReason === 'graceful') {
			await redis.del(SHUTDOWN_REASON_KEY);

			if (tracks.length === 0) {
				return;
			}

			const guild = client.guilds.cache.first();

			if (!guild || !client.user) {
				return;
			}

			const voiceChannel = guild.channels.cache.find((channel) => {
				if (!channel.isVoiceBased()) return false;
				return channel.members.filter((member) => !member.user.bot).size > 0;
			});

			if (!voiceChannel?.isVoiceBased()) {
				return;
			}

			const previousChannel = channelId
				? client.channels.cache.get(channelId)
				: null;
			const recoveryChannel = previousChannel?.isSendable()
				? previousChannel
				: debugChannel;

			if (!recoveryChannel?.isSendable()) {
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

			return;
		}

		if (tracks.length > 0 && debugChannel?.isSendable()) {
			await debugChannel.send(
				'Found a saved queue from a previous session. Use `/recover` to restore it.',
			);
		}
	} catch (error) {
		logger.error(error, 'Startup recovery failed');
	}
}
