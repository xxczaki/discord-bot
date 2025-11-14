import { EventEmitter } from 'node:events';
import { captureException } from '@sentry/node';
import type { ChatInputCommandInteraction } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import logger from '../../utils/logger';
import redis from '../../utils/redis';
import latenessCommandHandler from '../lateness';

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

beforeEach(() => {
	vi.clearAllMocks();

	mockInteraction.reply = vi.fn().mockResolvedValue(mockResponse);
	mockInteraction.editReply = vi.fn();
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

		expect(mockInteraction.reply).toHaveBeenCalledWith({
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

		expect(mockInteraction.reply).toHaveBeenCalledWith(
			expect.stringContaining('Measuring lateness, expected today at:'),
		);
	});
});

describe('when showing stats without expected hour', () => {
	let mockStatsStream: EventEmitter & { pause: () => void; resume: () => void };

	beforeEach(() => {
		mockInteraction.options.getString = vi.fn().mockReturnValue(null);
		mockStatsStream = Object.assign(new EventEmitter(), {
			pause: vi.fn(),
			resume: vi.fn(),
		});
		mockLatenessHandler.getStats = vi.fn().mockReturnValue(mockStatsStream);
	});

	it('should show loading message initially', async () => {
		const promise = latenessCommandHandler(mockInteraction);

		// Trigger stream end to resolve the promise
		process.nextTick(() => mockStatsStream.emit('end'));

		await promise;

		expect(mockInteraction.reply).toHaveBeenCalledWith(
			'Loading lateness data…',
		);
	});

	it('should process stats data and create embed with records', async () => {
		mockedRedis.get.mockResolvedValue(SAMPLE_REDIS_DATA);

		const promise = latenessCommandHandler(mockInteraction);

		// Emit data then end
		process.nextTick(() => {
			mockStatsStream.emit('data', [SAMPLE_REDIS_KEY]);
			mockStatsStream.emit('end');
		});

		await promise;

		expect(mockedRedis.get).toHaveBeenCalledWith(SAMPLE_REDIS_KEY);
		expect(mockInteraction.editReply).toHaveBeenCalledWith({
			embeds: [
				expect.objectContaining({
					data: expect.objectContaining({
						title: 'Lateness',
						description: expect.stringContaining('**20 Most Recent Records**:'),
						fields: expect.arrayContaining([
							expect.objectContaining({
								name: 'Total Records',
								value: '1',
								inline: true,
							}),
							expect.objectContaining({
								name: 'Average Delay',
								value: expect.stringContaining('5 min'),
								inline: true,
							}),
						]),
						footer: expect.objectContaining({
							text: 'Not showing and counting records spanning more than 2 days',
						}),
					}),
				}),
			],
			content: null,
		});
	});

	it('should handle empty stats gracefully', async () => {
		const promise = latenessCommandHandler(mockInteraction);

		// Emit empty data then end
		process.nextTick(() => {
			mockStatsStream.emit('data', []);
			mockStatsStream.emit('end');
		});

		await promise;

		expect(mockInteraction.editReply).toHaveBeenCalledWith({
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
								value: expect.stringContaining('0 min'),
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

		const promise = latenessCommandHandler(mockInteraction);

		process.nextTick(() => {
			mockStatsStream.emit('data', [SAMPLE_REDIS_KEY]);
			mockStatsStream.emit('end');
		});

		await promise;

		expect(mockInteraction.editReply).toHaveBeenCalledWith({
			embeds: [
				expect.objectContaining({
					data: expect.objectContaining({
						description: expect.stringContaining('*empty*'),
					}),
				}),
			],
			content: null,
		});
	});

	it('should handle Redis data parsing errors', async () => {
		mockedRedis.get.mockResolvedValue('invalid-json');

		const promise = latenessCommandHandler(mockInteraction);

		process.nextTick(() => {
			mockStatsStream.emit('data', [SAMPLE_REDIS_KEY]);
			mockStatsStream.emit('end');
		});

		await promise;

		expect(mockedLogger.error).toHaveBeenCalled();
		expect(mockedCaptureException).toHaveBeenCalled();
	});

	it('should only count positive delays for average calculation', async () => {
		const onTimeData = JSON.stringify({
			expected: EXPECTED_DATE.toISOString(),
			actual: new Date('2025-05-28T14:25:00.000Z').toISOString(), // 5 minutes early
		});

		mockedRedis.get
			.mockResolvedValueOnce(SAMPLE_REDIS_DATA) // 5 minutes late
			.mockResolvedValueOnce(onTimeData); // 5 minutes early

		const promise = latenessCommandHandler(mockInteraction);

		process.nextTick(() => {
			mockStatsStream.emit('data', ['key1', 'key2']);
			mockStatsStream.emit('end');
		});

		await promise;

		expect(mockInteraction.editReply).toHaveBeenCalledWith({
			embeds: [
				expect.objectContaining({
					data: expect.objectContaining({
						fields: expect.arrayContaining([
							expect.objectContaining({
								name: 'Average Delay',
								value: expect.stringContaining('5 min'),
							}),
						]),
					}),
				}),
			],
			content: null,
		});
	});

	it('should handle records with no actual arrival time', async () => {
		const noArrivalData = JSON.stringify({
			expected: EXPECTED_DATE.toISOString(),
			actual: null,
		});

		mockedRedis.get.mockResolvedValue(noArrivalData);

		const promise = latenessCommandHandler(mockInteraction);

		process.nextTick(() => {
			mockStatsStream.emit('data', [SAMPLE_REDIS_KEY]);
			mockStatsStream.emit('end');
		});

		await promise;

		expect(mockInteraction.editReply).toHaveBeenCalledWith({
			embeds: [
				expect.objectContaining({
					data: expect.objectContaining({
						description: expect.stringContaining('Not arrived'),
					}),
				}),
			],
			content: null,
		});
	});
});

describe('calculateLateness function behavior', () => {
	it('should return "NOT ARRIVED" for null difference', async () => {
		const noArrivalData = JSON.stringify({
			expected: EXPECTED_DATE.toISOString(),
			actual: null,
		});

		mockedRedis.get.mockResolvedValue(noArrivalData);
		mockInteraction.options.getString = vi.fn().mockReturnValue(null);

		const mockStatsStream = Object.assign(new EventEmitter(), {
			pause: vi.fn(),
			resume: vi.fn(),
		});
		mockLatenessHandler.getStats = vi.fn().mockReturnValue(mockStatsStream);

		const promise = latenessCommandHandler(mockInteraction);

		process.nextTick(() => {
			mockStatsStream.emit('data', [SAMPLE_REDIS_KEY]);
			mockStatsStream.emit('end');
		});

		await promise;

		expect(mockInteraction.editReply).toHaveBeenCalledWith({
			embeds: [
				expect.objectContaining({
					data: expect.objectContaining({
						description: expect.stringContaining('Not arrived'),
					}),
				}),
			],
			content: null,
		});
	});

	it('should return "ON TIME / EARLY" for non-positive difference', async () => {
		const earlyData = JSON.stringify({
			expected: EXPECTED_DATE.toISOString(),
			actual: new Date('2025-05-28T14:25:00.000Z').toISOString(), // 5 minutes early
		});

		mockedRedis.get.mockResolvedValue(earlyData);
		mockInteraction.options.getString = vi.fn().mockReturnValue(null);

		const mockStatsStream = Object.assign(new EventEmitter(), {
			pause: vi.fn(),
			resume: vi.fn(),
		});
		mockLatenessHandler.getStats = vi.fn().mockReturnValue(mockStatsStream);

		const promise = latenessCommandHandler(mockInteraction);

		process.nextTick(() => {
			mockStatsStream.emit('data', [SAMPLE_REDIS_KEY]);
			mockStatsStream.emit('end');
		});

		await promise;

		expect(mockInteraction.editReply).toHaveBeenCalledWith({
			embeds: [
				expect.objectContaining({
					data: expect.objectContaining({
						description: expect.stringContaining('On time / Early'),
					}),
				}),
			],
			content: null,
		});
	});

	it('should return "LATE ≤ 15 min" for delays up to 15 minutes', async () => {
		const slightlyLateData = JSON.stringify({
			expected: EXPECTED_DATE.toISOString(),
			actual: new Date('2025-05-28T14:40:00.000Z').toISOString(), // 10 minutes late
		});

		mockedRedis.get.mockResolvedValue(slightlyLateData);
		mockInteraction.options.getString = vi.fn().mockReturnValue(null);

		const mockStatsStream = Object.assign(new EventEmitter(), {
			pause: vi.fn(),
			resume: vi.fn(),
		});
		mockLatenessHandler.getStats = vi.fn().mockReturnValue(mockStatsStream);

		const promise = latenessCommandHandler(mockInteraction);

		process.nextTick(() => {
			mockStatsStream.emit('data', [SAMPLE_REDIS_KEY]);
			mockStatsStream.emit('end');
		});

		await promise;

		expect(mockInteraction.editReply).toHaveBeenCalledWith({
			embeds: [
				expect.objectContaining({
					data: expect.objectContaining({
						description: expect.stringContaining('Late ≤ 15 min'),
					}),
				}),
			],
			content: null,
		});
	});

	it('should return "LATE" for delays over 15 minutes', async () => {
		const veryLateData = JSON.stringify({
			expected: EXPECTED_DATE.toISOString(),
			actual: new Date('2025-05-28T15:00:00.000Z').toISOString(), // 30 minutes late
		});

		mockedRedis.get.mockResolvedValue(veryLateData);
		mockInteraction.options.getString = vi.fn().mockReturnValue(null);

		const mockStatsStream = Object.assign(new EventEmitter(), {
			pause: vi.fn(),
			resume: vi.fn(),
		});
		mockLatenessHandler.getStats = vi.fn().mockReturnValue(mockStatsStream);

		const promise = latenessCommandHandler(mockInteraction);

		process.nextTick(() => {
			mockStatsStream.emit('data', [SAMPLE_REDIS_KEY]);
			mockStatsStream.emit('end');
		});

		await promise;

		expect(mockInteraction.editReply).toHaveBeenCalledWith({
			embeds: [
				expect.objectContaining({
					data: expect.objectContaining({
						description: expect.stringContaining('Late'),
					}),
				}),
			],
			content: null,
		});
	});
});
