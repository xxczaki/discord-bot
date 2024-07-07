import type {
	ButtonBuilder,
	CacheType,
	ChatInputCommandInteraction,
} from 'discord.js';
import { LatenessHandler } from '../utils/LatenessHandler';

const lateness = LatenessHandler.getInstance();

export default async function latenessCommandHandler(
	interaction: ChatInputCommandInteraction<CacheType>,
) {
	if (await lateness.isLocked) {
		const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import(
			'discord.js'
		);

		const arrived = new ButtonBuilder()
			.setCustomId('arrived')
			.setLabel('Stop (user arrived)')
			.setStyle(ButtonStyle.Success);

		const notArrived = new ButtonBuilder()
			.setCustomId('not-arrived')
			.setLabel('Stop (user NEVER arrived)')
			.setStyle(ButtonStyle.Danger);

		const cancel = new ButtonBuilder()
			.setCustomId('cancel')
			.setLabel('Continue measuring')
			.setStyle(ButtonStyle.Secondary);

		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
			arrived,
			notArrived,
			cancel,
		);

		const response = await interaction.editReply({
			content: '⚠️ Lateness measurement is already in progress\n',
			components: [row],
		});

		try {
			const answer = await response.awaitMessageComponent({
				time: 60_000, // 1 minute
			});

			switch (answer.customId) {
				case 'arrived':
					await lateness.end(new Date());
					await answer.update({
						content: '✅ Measurement stopped',
						components: [],
					});
					break;
				case 'not-arrived':
					await lateness.end(null);
					await answer.update({
						content: '✅ Measurement stopped',
						components: [],
					});
					break;
				default:
					await answer.update({
						content: '⏳ Continuing to measure lateness',
						components: [],
					});
			}
		} catch (e) {
			await interaction.editReply({
				content:
					'⏳ Answer not received within 1 minute, continuing to measure lateness',
				components: [],
			});
		}

		return;
	}

	const expected = interaction.options.getString('expected_hour');

	if (!expected) {
		const statsStream = lateness.getStats();
		const stats: Record<number, string> = {};
		const delays: number[] = [];

		await interaction.editReply('Loading lateness data…');

		const [
			{ differenceInMinutes, format },
			{ default: redis },
			{ EmbedBuilder },
		] = await Promise.all([
			import('date-fns'),
			import('../utils/redis'),
			import('discord.js'),
		]);

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
							expected: string;
							actual: string | null;
						} = JSON.parse(rawKeyValue);

						const expected = new Date(value.expected);
						const actual = !value.actual ? null : new Date(value.actual);

						const difference = !actual
							? null
							: differenceInMinutes(actual, expected);

						if (difference && difference > 0) {
							delays.push(difference);
						}

						const identifier = `- \`${format(
							expected,
							'LLL d, HH:mm',
						)}\` **${calculateLateness(difference)}**`;

						stats[expected.getTime()] = identifier;
					} catch (error) {
						const { default: logger } = await import('../utils/logger');

						logger.error(error);
					}
				}

				// @ts-expect-error Object.entries is loosely typed
				const entries = Object.entries(stats) as [number, string][];
				const list = entries
					.sort(([a], [b]) => b - a)
					.slice(0, 20)
					.map(([, identifier]) => identifier)
					.join('\n');

				const embed = new EmbedBuilder()
					.setTitle('Lateness')
					.setDescription(`**20 most recent records**:\n${list || '*empty*'}`)
					.setFields([
						{
							name: 'Total records',
							value: entries.length.toString(),
							inline: true,
						},
						{
							name: 'Average delay',
							value: `\`${
								Math.round(delays.reduce((a, b) => a + b, 0) / delays.length) ||
								0
							} min\` (n: ${delays.length})`,
							inline: true,
						},
					])
					.setFooter({
						text: 'Not showing and counting records spanning more than 2 days.',
					});

				await interaction.editReply({ embeds: [embed], content: null });
				statsStream.resume();
			});

			statsStream.on('end', () => {
				resolve(void 'empty');
			});
		});
	}

	const today = new Date();
	const [hours, minutes] = expected
		.split(':')
		.map((value) => Number.parseInt(value, 10));

	today.setHours(hours, minutes, 0, 0);

	await lateness.start(today);

	await interaction.editReply(
		`✅ Measuring lateness, expected today at: \`${today.toLocaleTimeString(
			'pl',
		)}\`.`,
	);
}

function calculateLateness(differenceInMinutes: number | null) {
	if (!differenceInMinutes) {
		return '❌ NOT ARRIVED';
	}

	if (differenceInMinutes <= 0) {
		return '🟢 ON TIME / EARLY';
	}

	if (differenceInMinutes <= 15) {
		return '🟡 LATE ≤ 15 min';
	}

	return '🔴 LATE';
}
