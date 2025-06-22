import { captureException } from '@sentry/node';
import { type ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import logger from '../utils/logger';
import redis from '../utils/redis';
import { StatsHandler } from '../utils/StatsHandler';

const statsHandler = StatsHandler.getInstance();

export default async function statsCommandHandler(
	interaction: ChatInputCommandInteraction,
) {
	const statsStream = statsHandler.getStats('play');

	const playStatsMap: Record<string, number> = {};
	const requestedStatsMap: Record<string, number> = {};

	await interaction.reply('Loading latest stats…');

	return new Promise((resolve) => {
		statsStream.on('data', async (keys = []) => {
			statsStream.pause();

			for (const key of keys) {
				try {
					const rawKeyValue = await redis.get(key);

					if (!rawKeyValue) {
						continue;
					}

					const value: {
						title: string;
						author: string;
						requestedById?: string;
					} = JSON.parse(rawKeyValue);

					if (!value.requestedById) {
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
					logger.error(error);
					captureException(error);
				}
			}

			const playedList = Object.entries(playStatsMap)
				.filter(([, occurences]) => occurences > 1)
				.sort(([, a], [, b]) => b - a)
				.slice(0, 20)
				.map(([key, occurences]) => `${occurences} — ${key}`)
				.join('\n');

			const listToCount = Object.entries(requestedStatsMap).sort(
				([, a], [, b]) => b - a,
			);

			const requestedList = listToCount
				.map(([key, value]) => `${value} — <@!${key}>`)
				.join('\n');

			const embed = new EmbedBuilder()
				.setTitle('Statistics')
				.setDescription(
					`**Top 20 most frequently played**:\n${
						playedList || '*empty*'
					}\n\n**Most requested by**:\n${requestedList || '*empty*'}`,
				)
				.setFields([
					{
						name: 'Total played',
						value: listToCount.reduce((a, [, b]) => a + b, 0).toString(),
						inline: true,
					},
				])
				.setFooter({ text: 'Not showing tracks played just once.' });

			await interaction.editReply({ embeds: [embed], content: null });
			statsStream.resume();
		});

		statsStream.on('end', () => {
			resolve(void 'empty');
		});
	});
}
