import { captureException } from '@sentry/node';
import type { ChatInputCommandInteraction } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import logger from '../../utils/logger.ts';
import redis from '../../utils/redis.ts';
import latenessCommandHandler from '../lateness.ts';

const EXPECTED_HOUR = '14:30';
const EXPECTED_DATE = new Date('2025-05-28T14:30:00.000Z');
const ACTUAL_DATE = new Date('2025-05-28T14:35:00.000Z');
const SAMPLE_REDIS_KEY = 'discord-player:lateness:test-key';
const SAMPLE_REDIS_DATA = JSON.stringify({
	expected: EXPECTED_DATE.toISOString(),
	actual: ACTUAL_DATE.toISOString(),
});

const mockedRedis = vi.mocked(redis);
const mockedLogger = vi.mocked(logger);
const mockedCaptureException = vi.mocked(captureException);

const mockLatenessHandler = vi.hoisted(() => ({
	isLocked: Promise.resolve(false),
	start: vi.fn(),
	end: vi.fn(),
	getStats: vi.fn(),
}));

vi.mock('../../utils/LatenessHandler', () => ({
	LatenessHandler: {
		getInstance: () => mockLatenessHandler,
	},
}));

const mockInteraction = {
	reply: vi.fn(),
	editReply: vi.fn(),
	options: {
		getString: vi.fn(),
	},
} as unknown as ChatInputCommandInteraction;

const mockResponse = {
	awaitMessageComponent: vi.fn(),
};

const mockAnswer = {
	customId: '',
	update: vi.fn(),
};

function createScanStream(batches: string[][]): AsyncIterable<string[]> {
	return {
		async *[Symbol.asyncIterator]() {
			for (const batch of batches) {
				yield batch;
			}
		},
	};
}

function createFailingScanStream(error: Error): AsyncIterable<string[]> {
	return {
		async *[Symbol.asyncIterator]() {
			yield* [];
			throw error;
		},
	};
}

function formatExpectedLabel(date: Date) {
	const month = date.toLocaleString('en-US', { month: 'short' });
	const hours = date.getHours().toString().padStart(2, '0');
	const minutes = date.getMinutes().toString().padStart(2, '0');

	return `${month} ${date.getDate()}, ${hours}:${minutes}`;
}

function getEmbedReplies() {
	return vi
		.mocked(mockInteraction.editReply)
		.mock.calls.filter(
			([payload]) => typeof payload === 'object' && 'embeds' in payload,
		);
}

function expectEmbedDescriptionToContain(text: string) {
	expect(mockInteraction.editReply).toHaveBeenLastCalledWith({
		embeds: [
			expect.objectContaining({
				data: expect.objectContaining({
					description: expect.stringContaining(text),
				}),
			}),
		],
		content: null,
	});
}

beforeEach(() => {
	vi.clearAllMocks();

	mockInteraction.reply = vi.fn().mockResolvedValue(mockResponse);
	mockInteraction.editReply = vi.fn().mockResolvedValue(mockResponse);
	mockInteraction.options.getString = vi.fn();

	mockResponse.awaitMessageComponent = vi.fn();
	mockAnswer.update = vi.fn();

	mockLatenessHandler.isLocked = Promise.resolve(false);
	mockLatenessHandler.start = vi.fn();
	mockLatenessHandler.end = vi.fn();
	mockLatenessHandler.getStats = vi.fn();
});

describe('when lateness is already locked', () => {
	beforeEach(() => {
		mockLatenessHandler.isLocked = Promise.resolve(true);
	});

	it('should show action buttons when measurement is in progress', async () => {
		await latenessCommandHandler(mockInteraction);

		expect(mockInteraction.editReply).toHaveBeenCalledWith({
			content: 'Lateness measurement is already in progress.',
			components: expect.arrayContaining([
				expect.objectContaining({
					components: expect.arrayContaining([
						expect.objectContaining({
							data: expect.objectContaining({
								custom_id: 'arrived',
								label: 'Stop (user arrived)',
								style: 3,
							}),
						}),
						expect.objectContaining({
							data: expect.objectContaining({
								custom_id: 'not-arrived',
								label: 'Stop (user NEVER arrived)',
								style: 4,
							}),
						}),
						expect.objectContaining({
							data: expect.objectContaining({
								custom_id: 'cancel',
								label: 'Continue measuring',
								style: 2,
							}),
						}),
					]),
				}),
			]),
		});
	});

	it('should end measurement with arrival time when `arrived` button is clicked', async () => {
		mockAnswer.customId = 'arrived';
		mockResponse.awaitMessageComponent.mockResolvedValue(mockAnswer);

		await latenessCommandHandler(mockInteraction);

		expect(mockLatenessHandler.end).toHaveBeenCalledWith(expect.any(Date));
		expect(mockAnswer.update).toHaveBeenCalledWith({
			content: 'Measurement stopped.',
			components: [],
		});
	});

	it('should end measurement without arrival time when `not-arrived` button is clicked', async () => {
		mockAnswer.customId = 'not-arrived';
		mockResponse.awaitMessageComponent.mockResolvedValue(mockAnswer);

		await latenessCommandHandler(mockInteraction);

		expect(mockLatenessHandler.end).toHaveBeenCalledWith(null);
		expect(mockAnswer.update).toHaveBeenCalledWith({
			content: 'Measurement stopped.',
			components: [],
		});
	});

	it('should continue measurement when `cancel` button is clicked', async () => {
		mockAnswer.customId = 'cancel';
		mockResponse.awaitMessageComponent.mockResolvedValue(mockAnswer);

		await latenessCommandHandler(mockInteraction);

		expect(mockLatenessHandler.end).not.toHaveBeenCalled();
		expect(mockAnswer.update).toHaveBeenCalledWith({
			content: 'Continuing to measure lateness.',
			components: [],
		});
	});

	it('should handle timeout when no button is clicked within time limit', async () => {
		mockResponse.awaitMessageComponent.mockRejectedValue(new Error('Timeout'));

		await latenessCommandHandler(mockInteraction);

		expect(mockInteraction.editReply).toHaveBeenCalledWith({
			content:
				'Answer not received within 1 minute, continuing to measure lateness.',
			components: [],
		});
	});
});

describe('when starting new measurement', () => {
	beforeEach(() => {
		mockInteraction.options.getString = vi.fn().mockReturnValue(EXPECTED_HOUR);
	});

	it('should start measurement with correct expected time', async () => {
		await latenessCommandHandler(mockInteraction);

		expect(mockLatenessHandler.start).toHaveBeenCalledWith(expect.any(Date));

		const calledDate = vi.mocked(mockLatenessHandler.start).mock.calls[0][0];
		expect(calledDate.getHours()).toBe(14);
		expect(calledDate.getMinutes()).toBe(30);
		expect(calledDate.getSeconds()).toBe(0);
		expect(calledDate.getMilliseconds()).toBe(0);
	});

	it('should reply with confirmation message', async () => {
		await latenessCommandHandler(mockInteraction);

		expect(mockInteraction.editReply).toHaveBeenCalledWith(
			expect.stringContaining('Measuring lateness, expected today at:'),
		);
	});
});

describe('when showing stats without expected hour', () => {
	beforeEach(() => {
		mockInteraction.options.getString = vi.fn().mockReturnValue(null);
		mockLatenessHandler.getStats = vi
			.fn()
			.mockReturnValue(createScanStream([]));
	});

	it('should show loading message initially', async () => {
		await latenessCommandHandler(mockInteraction);

		expect(mockInteraction.editReply).toHaveBeenNthCalledWith(
			1,
			'Loading lateness data…',
		);
	});

	it('should process stats data and create embed with records', async () => {
		mockedRedis.get.mockResolvedValue(SAMPLE_REDIS_DATA);
		mockLatenessHandler.getStats = vi
			.fn()
			.mockReturnValue(createScanStream([[SAMPLE_REDIS_KEY]]));

		await latenessCommandHandler(mockInteraction);

		expect(mockedRedis.get).toHaveBeenCalledWith(SAMPLE_REDIS_KEY);
		expect(mockInteraction.editReply).toHaveBeenLastCalledWith({
			embeds: [
				expect.objectContaining({
					data: expect.objectContaining({
						title: 'Lateness',
						description: `**20 Most Recent Records**:\n- \`${formatExpectedLabel(EXPECTED_DATE)}\` **Late ≤ 15 min**`,
						fields: [
							{
								name: 'Total Records',
								value: '1',
								inline: true,
							},
							{
								name: 'Average Delay',
								value: '`5 min` (n: 1)',
								inline: true,
							},
						],
						footer: expect.objectContaining({
							text: 'Not showing and counting records spanning more than 2 days',
						}),
					}),
				}),
			],
			content: null,
		});
	});

	it('should render a single embed after consuming every batch', async () => {
		const laterDate = new Date('2025-05-29T14:30:00.000Z');

		mockedRedis.get
			.mockResolvedValueOnce(SAMPLE_REDIS_DATA)
			.mockResolvedValueOnce(
				JSON.stringify({
					expected: laterDate.toISOString(),
					actual: new Date('2025-05-29T14:50:00.000Z').toISOString(),
				}),
			);
		mockLatenessHandler.getStats = vi
			.fn()
			.mockReturnValue(createScanStream([['key1'], [], ['key2']]));

		await latenessCommandHandler(mockInteraction);

		expect(getEmbedReplies()).toHaveLength(1);
		expect(mockInteraction.editReply).toHaveBeenLastCalledWith({
			embeds: [
				expect.objectContaining({
					data: expect.objectContaining({
						description: `**20 Most Recent Records**:\n- \`${formatExpectedLabel(laterDate)}\` **Late**\n- \`${formatExpectedLabel(EXPECTED_DATE)}\` **Late ≤ 15 min**`,
						fields: expect.arrayContaining([
							expect.objectContaining({
								name: 'Total Records',
								value: '2',
							}),
							expect.objectContaining({
								name: 'Average Delay',
								value: '`13 min` (n: 2)',
							}),
						]),
					}),
				}),
			],
			content: null,
		});
	});

	it('should only list the 20 most recent records', async () => {
		const keys = Array.from({ length: 25 }, (_, index) => `key-${index}`);

		for (const [index] of keys.entries()) {
			const expectedDate = new Date(EXPECTED_DATE);
			expectedDate.setUTCDate(expectedDate.getUTCDate() + index);

			mockedRedis.get.mockResolvedValueOnce(
				JSON.stringify({
					expected: expectedDate.toISOString(),
					actual: expectedDate.toISOString(),
				}),
			);
		}

		mockLatenessHandler.getStats = vi
			.fn()
			.mockReturnValue(createScanStream([keys.slice(0, 10), keys.slice(10)]));

		await latenessCommandHandler(mockInteraction);

		const [[payload]] = getEmbedReplies();

		if (typeof payload !== 'object' || !('embeds' in payload)) {
			throw new Error('Expected an embed reply');
		}

		const [embed] = payload.embeds ?? [];
		const embedData = 'toJSON' in embed ? embed.toJSON() : embed;
		const records = embedData.description?.split('\n').slice(1) ?? [];

		const newestDate = new Date(EXPECTED_DATE);
		newestDate.setUTCDate(newestDate.getUTCDate() + 24);

		expect(records).toHaveLength(20);
		expect(records[0]).toContain(formatExpectedLabel(newestDate));
		expect(embedData.fields).toContainEqual({
			name: 'Total Records',
			value: '25',
			inline: true,
		});
	});

	it('should handle empty stats gracefully', async () => {
		mockLatenessHandler.getStats = vi
			.fn()
			.mockReturnValue(createScanStream([[]]));

		await latenessCommandHandler(mockInteraction);

		expect(mockedRedis.get).not.toHaveBeenCalled();
		expect(mockInteraction.editReply).toHaveBeenLastCalledWith({
			embeds: [
				expect.objectContaining({
					data: expect.objectContaining({
						description: expect.stringContaining('*empty*'),
						fields: expect.arrayContaining([
							expect.objectContaining({
								name: 'Total Records',
								value: '0',
							}),
							expect.objectContaining({
								name: 'Average Delay',
								value: '`0 min` (n: 0)',
							}),
						]),
					}),
				}),
			],
			content: null,
		});
	});

	it('should skip invalid Redis data', async () => {
		mockedRedis.get.mockResolvedValue(null);
		mockLatenessHandler.getStats = vi
			.fn()
			.mockReturnValue(createScanStream([[SAMPLE_REDIS_KEY]]));

		await latenessCommandHandler(mockInteraction);

		expectEmbedDescriptionToContain('*empty*');
	});

	it('should handle Redis data parsing errors', async () => {
		mockedRedis.get.mockResolvedValue('invalid-json');
		mockLatenessHandler.getStats = vi
			.fn()
			.mockReturnValue(createScanStream([[SAMPLE_REDIS_KEY]]));

		await latenessCommandHandler(mockInteraction);

		expect(mockedLogger.error).toHaveBeenCalledWith(
			expect.any(SyntaxError),
			'Failed to parse lateness stats JSON data',
		);
		expect(mockedCaptureException).toHaveBeenCalled();
		expectEmbedDescriptionToContain('*empty*');
	});

	it('should log a warning when the final reply fails', async () => {
		const editError = new Error('Unknown interaction');

		mockInteraction.editReply = vi
			.fn()
			.mockResolvedValueOnce(mockResponse)
			.mockRejectedValueOnce(editError);

		await expect(
			latenessCommandHandler(mockInteraction),
		).resolves.toBeUndefined();

		expect(mockedLogger.warn).toHaveBeenCalledWith(
			editError,
			'Failed to edit lateness reply',
		);
	});

	it('should propagate errors thrown while scanning', async () => {
		mockLatenessHandler.getStats = vi
			.fn()
			.mockReturnValue(
				createFailingScanStream(new Error('Redis connection lost')),
			);

		await expect(latenessCommandHandler(mockInteraction)).rejects.toThrow(
			'Redis connection lost',
		);
	});

	it('should only count positive delays for average calculation', async () => {
		const onTimeData = JSON.stringify({
			expected: new Date('2025-05-29T14:30:00.000Z').toISOString(),
			actual: new Date('2025-05-29T14:25:00.000Z').toISOString(),
		});

		mockedRedis.get
			.mockResolvedValueOnce(SAMPLE_REDIS_DATA)
			.mockResolvedValueOnce(onTimeData);
		mockLatenessHandler.getStats = vi
			.fn()
			.mockReturnValue(createScanStream([['key1', 'key2']]));

		await latenessCommandHandler(mockInteraction);

		expect(mockInteraction.editReply).toHaveBeenLastCalledWith({
			embeds: [
				expect.objectContaining({
					data: expect.objectContaining({
						fields: expect.arrayContaining([
							expect.objectContaining({
								name: 'Total Records',
								value: '2',
							}),
							expect.objectContaining({
								name: 'Average Delay',
								value: '`5 min` (n: 1)',
							}),
						]),
					}),
				}),
			],
			content: null,
		});
	});

	it('should handle records with no actual arrival time', async () => {
		mockedRedis.get.mockResolvedValue(
			JSON.stringify({
				expected: EXPECTED_DATE.toISOString(),
				actual: null,
			}),
		);
		mockLatenessHandler.getStats = vi
			.fn()
			.mockReturnValue(createScanStream([[SAMPLE_REDIS_KEY]]));

		await latenessCommandHandler(mockInteraction);

		expectEmbedDescriptionToContain('Not arrived');
	});
});

describe('calculateLateness function behavior', () => {
	beforeEach(() => {
		mockInteraction.options.getString = vi.fn().mockReturnValue(null);
		mockLatenessHandler.getStats = vi
			.fn()
			.mockReturnValue(createScanStream([[SAMPLE_REDIS_KEY]]));
	});

	it('should return `Not arrived` for null difference', async () => {
		mockedRedis.get.mockResolvedValue(
			JSON.stringify({
				expected: EXPECTED_DATE.toISOString(),
				actual: null,
			}),
		);

		await latenessCommandHandler(mockInteraction);

		expectEmbedDescriptionToContain('**Not arrived**');
	});

	it('should return `On time / Early` for non-positive difference', async () => {
		mockedRedis.get.mockResolvedValue(
			JSON.stringify({
				expected: EXPECTED_DATE.toISOString(),
				actual: new Date('2025-05-28T14:25:00.000Z').toISOString(),
			}),
		);

		await latenessCommandHandler(mockInteraction);

		expectEmbedDescriptionToContain('**On time / Early**');
	});

	it('should return `Late ≤ 15 min` for delays up to 15 minutes', async () => {
		mockedRedis.get.mockResolvedValue(
			JSON.stringify({
				expected: EXPECTED_DATE.toISOString(),
				actual: new Date('2025-05-28T14:45:00.000Z').toISOString(),
			}),
		);

		await latenessCommandHandler(mockInteraction);

		expectEmbedDescriptionToContain('**Late ≤ 15 min**');
	});

	it('should return `Late` for delays over 15 minutes', async () => {
		mockedRedis.get.mockResolvedValue(
			JSON.stringify({
				expected: EXPECTED_DATE.toISOString(),
				actual: new Date('2025-05-28T15:00:00.000Z').toISOString(),
			}),
		);

		await latenessCommandHandler(mockInteraction);

		expectEmbedDescriptionToContain('**Late**');
	});
});
