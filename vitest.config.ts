import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		globals: true,
		environment: 'node',

		pool: 'vmThreads',

		projects: [
			{
				test: {
					name: 'discord-bot',
					setupFiles: ['./src/setupTests.ts'],
					include: ['src/**/*.test.ts'],
				},
				resolve: {
					alias: {
						'discord-player-googlevideo': fileURLToPath(
							new URL(
								'./packages/discord-player-googlevideo/src/index.ts',
								import.meta.url,
							),
						),
					},
				},
			},
			{
				extends: true,
				test: {
					name: 'discord-player-googlevideo',
					root: './packages/discord-player-googlevideo',
					include: ['src/**/*.test.ts'],
				},
			},
		],

		coverage: {
			provider: 'v8',
			reporter: ['text', 'lcov'],
			include: ['src/**/*.ts', 'packages/*/src/**/*.ts'],
			exclude: [
				'src/**/*.test.ts',
				'packages/*/src/**/*.test.ts',
				'src/setupTests.ts',
				'src/types/ProcessingInteraction.ts',
				'src/utils/redis.ts',
				'src/utils/instrument.ts',
				'**/tests/**',
				'**/dist/**',
				'**/node_modules/**',
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
