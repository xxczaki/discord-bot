import { sentryEsbuildPlugin } from '@sentry/esbuild-plugin';
import * as esbuild from 'esbuild';
import esbuildPluginPino from 'esbuild-plugin-pino';

await esbuild.build({
	entryPoints: ['src/index.ts'],
	bundle: true,
	platform: 'node',
	target: 'node20',
	external: [
		'@discord-player/extractor',
		'bufferutil',
		'discord-player',
		'discord-player-youtubei',
		'discord.js',
		'sodium-native',
		'utf-8-validate',
		'zlib-sync',
	],
	plugins: [
		esbuildPluginPino({ transports: [] }),
		sentryEsbuildPlugin({
			authToken: process.env.SENTRY_AUTH_TOKEN,
			org: 'parsify-technologies',
			project: 'icc-discord-bot',
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
