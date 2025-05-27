import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		globals: true,
		environment: 'node',
		setupFiles: ['./src/setupTests.ts'],

		pool: 'threads',
		poolOptions: {
			threads: {
				singleThread: false,
				maxThreads: 4,
				minThreads: 2,
			},
		},

		include: ['src/**/*.test.ts'],
	},
});
