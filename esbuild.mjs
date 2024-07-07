import * as esbuild from 'esbuild';
import esbuildPluginPino from 'esbuild-plugin-pino';
import { sentryEsbuildPlugin } from '@sentry/esbuild-plugin';

await esbuild.build({
	entryPoints: ['src/index.ts'],
	bundle: true,
	platform: 'node',
	target: 'node20',
	external: [
		'@discord-player/extractor',
		'@discordjs/opus',
		'@distube/ytdl-core',
		'@sentry/profiling-node',
		'bufferutil',
		'discord-player',
		'discord.js',
		'sodium-native',
		'utf-8-validate',
	],
	plugins: [
		esbuildPluginPino({ transports: [] }),
		sentryEsbuildPlugin({
			authToken: process.env.SENTRY_AUTH_TOKEN,
			org: 'parsify-technologies',
			project: 'icc-discord-bot',
		}),
	],
	outdir: 'dist',
	minify: true,
	sourcemap: true,
});
