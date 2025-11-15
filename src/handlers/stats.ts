import { type ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import redis from '../utils/redis';
import reportError from '../utils/reportError';
import { StatsHandler } from '../utils/StatsHandler';

const statsHandler = StatsHandler.getInstance();

export default async function statsCommandHandler(
	interaction: ChatInputCommandInteraction,
) {
	const playStatsStream = statsHandler.getStats('play');
	const playlistStatsStream = statsHandler.getStats('playlist');

	const playStatsMap: Record<string, number> = {};
	const requestedStatsMap: Record<string, number> = {};
	const playlistStatsMap: Record<string, number> = {};

	const botId = interaction.client.user.id;

	await interaction.reply('Loading latest stats…');

	const pendingPromises: Promise<void>[] = [];

	return new Promise((resolve) => {
		playStatsStream.on('data', (keys = []) => {
			playStatsStream.pause();

			const processingPromise = (async () => {
				if (keys.length > 0) {
					try {
						const pipeline = redis.pipeline();

						for (const key of keys) {
							pipeline.get(key);
						}

						const results = await pipeline.exec();

						if (results) {
							for (const [error, rawKeyValue] of results) {
								if (error || !rawKeyValue) {
									continue;
								}

								try {
									const value: {
										title: string;
										author: string;
										requestedById?: string;
									} = JSON.parse(rawKeyValue as string);

									if (!value.requestedById || value.requestedById === botId) {
										continue;
									}

									const identifier = `"${value.title}" by ${value.author}`;

									if (identifier in playStatsMap) {
										playStatsMap[identifier] = playStatsMap[identifier] + 1;
									} else {
										playStatsMap[identifier] = 1;
									}

									if (value.requestedById in requestedStatsMap) {
										requestedStatsMap[value.requestedById] =
											requestedStatsMap[value.requestedById] + 1;
										continue;
									}

									requestedStatsMap[value.requestedById] = 1;
								} catch (error) {
									reportError(error, 'Failed to parse stats JSON value');
								}
							}
						}
					} catch (error) {
						reportError(error, 'Failed to process stats data from Redis');
					}
				}
			})();

			pendingPromises.push(processingPromise);

			processingPromise.finally(() => {
				playStatsStream.resume();
			});
		});

		playStatsStream.on('end', async () => {
			await Promise.all(pendingPromises);
			playlistStatsStream.emit('start');
		});

		playlistStatsStream.on('start', () => {
			playlistStatsStream.resume();
		});

		playlistStatsStream.on('data', (keys = []) => {
			playlistStatsStream.pause();

			const processingPromise = (async () => {
				if (keys.length > 0) {
					try {
						const pipeline = redis.pipeline();

						for (const key of keys) {
							pipeline.get(key);
						}

						const results = await pipeline.exec();

						if (results) {
							for (const [error, rawKeyValue] of results) {
								if (error || !rawKeyValue) {
									continue;
								}

								try {
									const value: {
										playlistId: string;
										requestedById: string;
									} = JSON.parse(rawKeyValue as string);

									if (value.requestedById === botId) {
										continue;
									}

									if (value.playlistId in playlistStatsMap) {
										playlistStatsMap[value.playlistId] =
											playlistStatsMap[value.playlistId] + 1;
									} else {
										playlistStatsMap[value.playlistId] = 1;
									}
								} catch (error) {
									reportError(
										error,
										'Failed to parse playlist stats JSON value',
									);
								}
							}
						}
					} catch (error) {
						reportError(
							error,
							'Failed to process playlist stats data from Redis',
						);
					}
				}
			})();

			pendingPromises.push(processingPromise);

			processingPromise.finally(() => {
				playlistStatsStream.resume();
			});
		});

		playlistStatsStream.on('end', async () => {
			await Promise.all(pendingPromises);
			const playedList = Object.entries(playStatsMap)
				.filter(([, occurences]) => occurences > 1)
				.sort(([, a], [, b]) => b - a)
				.slice(0, 10)
				.map(([key, occurences]) => `${occurences} — ${key}`)
				.join('\n');

			const listToCount = Object.entries(requestedStatsMap).sort(
				([, a], [, b]) => b - a,
			);

			const requestedList = listToCount
				.map(([key, value]) => `${value} — <@!${key}>`)
				.join('\n');

			const playlistList = Object.entries(playlistStatsMap)
				.sort(([, a], [, b]) => b - a)
				.slice(0, 10)
				.map(([playlistId, count]) => `${count} — ${playlistId}`)
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
			resolve(void 'empty');
		});
	});
}
