import { type ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import redis from '../utils/redis.ts';
import reportError from '../utils/reportError.ts';
import { StatsHandler } from '../utils/StatsHandler.ts';

const statsHandler = StatsHandler.getInstance();

export default async function statsCommandHandler(
	interaction: ChatInputCommandInteraction,
) {
	const playStatsStream = statsHandler.getStats(
		interaction.guildId ?? '',
		'play',
	);
	const playlistStatsStream = statsHandler.getStats(
		interaction.guildId ?? '',
		'playlist',
	);

	const playStatsMap: Record<string, number> = {};
	const requestedStatsMap: Record<string, number> = {};
	const playlistStatsMap: Record<string, number> = {};

	const botId = interaction.client.user.id;

	await interaction.editReply('Loading latest stats…');

	for await (const keys of playStatsStream) {
		if (keys.length === 0) {
			continue;
		}

		try {
			const results = await getValues(keys);

			for (const rawKeyValue of results) {
				try {
					const value: {
						title: string;
						author: string;
						requestedById?: string;
					} = JSON.parse(rawKeyValue);

					if (!value.requestedById || value.requestedById === botId) {
						continue;
					}

					const identifier = `"${value.title}" by ${value.author}`;

					playStatsMap[identifier] = (playStatsMap[identifier] ?? 0) + 1;
					requestedStatsMap[value.requestedById] =
						(requestedStatsMap[value.requestedById] ?? 0) + 1;
				} catch (error) {
					reportError(error, 'Failed to parse stats JSON value');
				}
			}
		} catch (error) {
			reportError(error, 'Failed to process stats data from Redis');
		}
	}

	for await (const keys of playlistStatsStream) {
		if (keys.length === 0) {
			continue;
		}

		try {
			const results = await getValues(keys);

			/* v8 ignore start */
			for (const rawKeyValue of results) {
				try {
					const value: {
						playlistId: string;
						requestedById: string;
					} = JSON.parse(rawKeyValue);

					if (value.requestedById === botId) {
						continue;
					}

					playlistStatsMap[value.playlistId] =
						(playlistStatsMap[value.playlistId] ?? 0) + 1;
				} catch (error) {
					reportError(error, 'Failed to parse playlist stats JSON value');
				}
			}
			/* v8 ignore stop */
		} catch (error) {
			reportError(error, 'Failed to process playlist stats data from Redis');
		}
	}

	const playedList = Object.entries(playStatsMap)
		.filter(([, occurences]) => occurences > 1)
		.sort(([, a], [, b]) => b - a)
		.slice(0, 10)
		.map(([key, occurences]) => `${occurences} – ${key}`)
		.join('\n');

	const listToCount = Object.entries(requestedStatsMap).sort(
		([, a], [, b]) => b - a,
	);

	const requestedList = listToCount
		.map(([key, value]) => `${value} – <@!${key}>`)
		.join('\n');

	const playlistList = Object.entries(playlistStatsMap)
		.sort(([, a], [, b]) => b - a)
		.slice(0, 10)
		.map(([playlistId, count]) => `${count} – ${playlistId}`)
		.join('\n');

	const totalPlayed = listToCount.reduce((a, [, b]) => a + b, 0);

	const embed = new EmbedBuilder()
		.setTitle('Statistics')
		.setColor('Blue')
		.setDescription(
			`**Top 10 Most Frequently Played**:\n${
				playedList || '*empty*'
			}\n\n**Total Played**: ${totalPlayed}\n\n**Most Requested By**:\n${requestedList || '*empty*'}\n\n**Top 10 Most Enqueued Playlists**:\n${playlistList || '*empty*'}`,
		)
		.setFooter({ text: 'Not showing tracks played just once' });

	await interaction.editReply({ embeds: [embed], content: null });
}

async function getValues(keys: string[]) {
	const pipeline = redis.pipeline();

	for (const key of keys) {
		pipeline.get(key);
	}

	const results = (await pipeline.exec()) ?? [];

	return results.flatMap(([error, value]) =>
		!error && typeof value === 'string' && value ? [value] : [],
	);
}
