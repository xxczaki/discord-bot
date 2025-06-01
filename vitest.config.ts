import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		globals: true,
		environment: 'node',
		setupFiles: ['./src/setupTests.ts'],

		pool: 'vmThreads',

		include: ['src/**/*.test.ts'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'lcov'],
			include: ['src/**/*.ts'],
			exclude: ['src/**/*.test.ts', 'src/setupTests.ts'],
		},
	},
});
