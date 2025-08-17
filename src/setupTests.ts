import { vi } from 'vitest';

// Increase EventEmitter max listeners to avoid warnings during parallel testing
process.setMaxListeners(50);

vi.mock('./utils/logger', () => ({
	default: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
}));

vi.mock('@sentry/node', () => ({
	captureException: vi.fn(),
}));

vi.mock('./utils/redis', () => ({
	default: {
		scanStream: vi.fn(),
		del: vi.fn(),
		get: vi.fn(),
		set: vi.fn(),
		mget: vi.fn(),
		exists: vi.fn(),
		expire: vi.fn(),
		pipeline: vi.fn(),
	},
}));

vi.mock('node:fs', async (importOriginal) => {
	const actual = await importOriginal<typeof import('node:fs')>();

	return {
		...actual,
		existsSync: vi.fn().mockReturnValue(true),
		mkdirSync: vi.fn(),
		readFileSync: vi.fn(),
		writeFileSync: vi.fn(),
		unlinkSync: vi.fn(),
		readdirSync: vi.fn().mockReturnValue([]),
	};
});

vi.mock('ulid', () => ({
	ulid: vi.fn(),
}));
