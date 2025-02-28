import { sentryEsbuildPlugin } from '@sentry/esbuild-plugin';
import * as esbuild from 'esbuild';
import esbuildPluginPino from 'esbuild-plugin-pino';

await esbuild.build({
	entryPoints: ['src/index.ts'],
	bundle: true,
	platform: 'node',
	format: 'esm',
	target: 'node22',
	external: [
		'@discord-player/extractor',
		'bufferutil',
		'discord-player',
		'discord-player-youtubei',
		'discord.js',
		'sodium-native',
		'zlib-sync',

		// Dependencies incompatible with ESM bundling
		'@sentry/node',
		'pino',
		'ioredis',
		'ulid'
	],
	plugins: [
		esbuildPluginPino({ transports: [] }),
		sentryEsbuildPlugin({
			authToken: process.env.SENTRY_AUTH_TOKEN,
			org: 'parsify-tech',
			project: 'discord-bot',
			telemetry: false,
			release: {
				name: process.env.SENTRY_RELEASE_NAME,
			},
		}),
	],
	outdir: 'dist',
	minify: true,
	sourcemap: true,
	define: {
		'process.env.GIT_COMMIT_SHA': JSON.stringify(
			process.env.SENTRY_RELEASE_NAME ?? '',
		),
	},
});
