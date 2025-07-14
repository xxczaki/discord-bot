import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		globals: true,
		environment: 'node',
		setupFiles: ['./src/setupTests.ts'],

		pool: 'vmThreads',
		poolOptions: {
			vmThreads: {
				memoryLimit: '256MB',
			},
		},

		include: ['src/**/*.test.ts'],
		
		coverage: {
			provider: 'v8',
			reporter: ['text', 'lcov'],
			include: ['src/**/*.ts'],
			exclude: [
				'src/**/*.test.ts', 
				'src/setupTests.ts',
				'src/types/ProcessingInteraction.ts',
				'src/utils/redis.ts',
				'src/utils/instrument.ts'
			],
			thresholds: {
				global: {
					statements: 95,
					branches: 95,
					functions: 95,
					lines: 95,
				},
			},
		},
	},
});
