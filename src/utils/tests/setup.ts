import { vi } from 'vitest';

vi.mock('../logger', () => ({
	default: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
}));

vi.mock('ulid', () => ({
	ulid: vi.fn(),
}));
