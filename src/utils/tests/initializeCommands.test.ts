import { captureException } from '@sentry/node';
import { beforeEach, expect, it, vi } from 'vitest';
import COMMANDS from '../../constants/commands';
import initializeCommands from '../initializeCommands';
import logger from '../logger';

const mocks = vi.hoisted(() => {
	const MOCK_TOKEN = 'mock-discord-token';
	const MOCK_CLIENT_ID = 'mock-client-id';
	const MOCK_ROUTE = '/applications/mock-client-id/commands';

	return {
		MOCK_TOKEN,
		MOCK_CLIENT_ID,
		MOCK_ROUTE,
		mockREST: {
			setToken: vi.fn().mockReturnThis(),
			put: vi.fn(),
		},
		getEnvironmentVariable: vi.fn((name: string) => {
			if (name === 'TOKEN') return MOCK_TOKEN;
			if (name === 'CLIENT_ID') return MOCK_CLIENT_ID;
			throw new Error(`Unexpected environment variable: ${name}`);
		}),
		applicationCommands: vi.fn(() => MOCK_ROUTE),
		RESTConstructor: vi.fn(function () {
			return mocks.mockREST;
		}),
	};
});

vi.mock('discord.js', () => ({
	REST: mocks.RESTConstructor,
	Routes: {
		applicationCommands: mocks.applicationCommands,
	},
}));

vi.mock('../getEnvironmentVariable', () => ({
	default: mocks.getEnvironmentVariable,
}));

const mockedCaptureException = vi.mocked(captureException);
const mockedLogger = vi.mocked(logger);

beforeEach(() => {
	mocks.mockREST.put.mockClear();
	mockedCaptureException.mockClear();
	mockedLogger.info.mockClear();
	mockedLogger.error.mockClear();
	mocks.applicationCommands.mockClear();

	mocks.mockREST.put.mockResolvedValue(undefined);
});

it('should successfully initialize Discord commands', async () => {
	await initializeCommands();

	expect(mocks.applicationCommands).toHaveBeenCalledWith(mocks.MOCK_CLIENT_ID);
	expect(mocks.mockREST.put).toHaveBeenCalledWith(mocks.MOCK_ROUTE, {
		body: COMMANDS,
		signal: expect.any(AbortSignal),
	});
	expect(mockedLogger.info).toHaveBeenCalledWith(
		'Started refreshing application commands.',
	);
	expect(mockedLogger.info).toHaveBeenCalledWith(
		'Successfully reloaded application commands.',
	);
	expect(mockedLogger.error).not.toHaveBeenCalled();
	expect(mockedCaptureException).not.toHaveBeenCalled();
});

it('should handle `REST` API errors gracefully', async () => {
	const mockError = new Error('Discord API error');
	mocks.mockREST.put.mockRejectedValue(mockError);

	await initializeCommands();

	expect(mockedLogger.info).toHaveBeenCalledWith(
		'Started refreshing application commands.',
	);
	expect(mockedLogger.error).toHaveBeenCalledWith(
		mockError,
		'Application commands refresh failure',
	);
	expect(mockedCaptureException).toHaveBeenCalledWith(mockError);
	expect(mockedLogger.info).not.toHaveBeenCalledWith(
		'Successfully reloaded application commands.',
	);
});
