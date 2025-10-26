import { vi } from 'vitest';

// Suppress console output during tests to avoid spam from dependencies
global.console = {
	...console,
	log: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
	debug: vi.fn(),
	info: vi.fn(),
};
