import { defineProject } from 'vitest/config';

export default defineProject({
	test: {
		name: 'discord-player-googlevideo',
		include: ['src/**/*.test.ts'],
		setupFiles: ['./src/setupTests.ts'],
	},
});
