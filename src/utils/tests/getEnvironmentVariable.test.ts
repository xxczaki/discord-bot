import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import getEnvironmentVariable from '../getEnvironmentVariable';

const originalEnv = process.env;

beforeEach(() => {
	process.env = { ...originalEnv };
	vi.resetModules();
});

afterEach(() => {
	process.env = originalEnv;
});

it('should return the value of an existing environment variable', () => {
	process.env.TOKEN = 'test-token';

	expect(getEnvironmentVariable('TOKEN')).toBe('test-token');
});

it('should throw TypeError for missing environment variable', async () => {
	process.env.TOKEN = undefined;
	// Re-import to clear memoization cache
	const { default: freshGetEnvVar } = await import('../getEnvironmentVariable');

	expect(() => freshGetEnvVar('TOKEN')).toThrowError(
		new TypeError('Missing environment variable: TOKEN'),
	);
});

it('should handle different environment variable types', () => {
	process.env.CLIENT_ID = '123456789';
	process.env.NODE_ENV = 'development';
	process.env.REDIS_URL = 'redis://localhost:6379';

	expect(getEnvironmentVariable('CLIENT_ID')).toBe('123456789');
	expect(getEnvironmentVariable('NODE_ENV')).toBe('development');
	expect(getEnvironmentVariable('REDIS_URL')).toBe('redis://localhost:6379');
});
