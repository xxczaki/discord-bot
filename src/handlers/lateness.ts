import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	type ChatInputCommandInteraction,
	EmbedBuilder,
} from 'discord.js';
import { DEFAULT_MESSAGE_COMPONENT_AWAIT_TIME_MS } from '../constants/miscellaneous.ts';
import { LatenessHandler } from '../utils/LatenessHandler.ts';
import logger from '../utils/logger.ts';
import redis from '../utils/redis.ts';
import reportError from '../utils/reportError.ts';

const lateness = LatenessHandler.getInstance();

export default async function latenessCommandHandler(
	interaction: ChatInputCommandInteraction,
) {
	if (await lateness.isLocked) {
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
			content: 'Lateness measurement is already in progress.',
			components: [row],
		});

		try {
			const answer = await response.awaitMessageComponent({
				time: DEFAULT_MESSAGE_COMPONENT_AWAIT_TIME_MS,
			});

			switch (answer.customId) {
				case 'arrived':
					await lateness.end(new Date());
					return await answer.update({
						content: 'Measurement stopped.',
						components: [],
					});
				case 'not-arrived':
					await lateness.end(null);
					return await answer.update({
						content: 'Measurement stopped.',
						components: [],
					});
				default:
					return await answer.update({
						content: 'Continuing to measure lateness.',
						components: [],
					});
			}
		} catch {
			return interaction.editReply({
				content:
					'Answer not received within 1 minute, continuing to measure lateness.',
				components: [],
			});
		}
	}

	const expected = interaction.options.getString('expected_hour');

	if (!expected) {
		const statsStream = lateness.getStats();
		const stats = new Map<number, string>();
		const delays: number[] = [];

		await interaction.editReply('Loading lateness data…');

		for await (const keys of statsStream) {
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

					const expected = new Date(value.expected).toTemporalInstant();
					const actual = value.actual
						? new Date(value.actual).toTemporalInstant()
						: null;

					const difference = actual
						? expected.until(actual, { largestUnit: 'minutes' }).minutes
						: null;

					if (difference && difference > 0) {
						delays.push(difference);
					}

					const identifier = `- \`${expected.toLocaleString('en-US', {
						month: 'short',
						day: 'numeric',
						hour: '2-digit',
						minute: '2-digit',
						hourCycle: 'h23',
					})}\` **${calculateLateness(difference)}**`;

					stats.set(expected.epochMilliseconds, identifier);
				} catch (error) {
					reportError(error, 'Failed to parse lateness stats JSON data');
				}
			}
		}

		const list = [...stats]
			.sort(([a], [b]) => b - a)
			.slice(0, 20)
			.map(([, identifier]) => identifier)
			.join('\n');

		const embed = new EmbedBuilder()
			.setTitle('Lateness')
			.setColor('Blue')
			.setDescription(`**20 Most Recent Records**:\n${list || '*empty*'}`)
			.setFields([
				{
					name: 'Total Records',
					value: stats.size.toString(),
					inline: true,
				},
				{
					name: 'Average Delay',
					value: `\`${
						Math.round(delays.reduce((a, b) => a + b, 0) / delays.length) || 0
					} min\` (n: ${delays.length})`,
					inline: true,
				},
			])
			.setFooter({
				text: 'Not showing and counting records spanning more than 2 days',
			});

		try {
			await interaction.editReply({ embeds: [embed], content: null });
		} catch (error) {
			logger.warn(error, 'Failed to edit lateness reply');
		}

		return;
	}

	const today = new Date();
	const [hours, minutes] = expected
		.split(':')
		.map((value) => Number.parseInt(value, 10));

	today.setHours(hours, minutes, 0, 0);

	await lateness.start(today);

	await interaction.editReply(
		`Measuring lateness, expected today at: \`${today.toLocaleTimeString(
			'pl',
		)}\``,
	);
}

function calculateLateness(differenceInMinutes: number | null) {
	if (!differenceInMinutes) {
		return 'Not arrived';
	}

	if (differenceInMinutes <= 0) {
		return 'On time / Early';
	}

	if (differenceInMinutes <= 15) {
		return 'Late ≤ 15 min';
	}

	return 'Late';
}
