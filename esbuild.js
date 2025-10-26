import { globSync } from 'node:fs';
import { createRequire } from 'node:module';
import { sentryEsbuildPlugin } from '@sentry/esbuild-plugin';
import * as esbuild from 'esbuild';

const require = createRequire(import.meta.url);
const esbuildPluginPino = require('esbuild-plugin-pino');

const handlers = globSync('src/handlers/*.ts');

/** @type {import('esbuild').BuildOptions} */
const buildOptions = {
	entryPoints: ['src/index.ts', ...handlers],
	bundle: true,
	platform: 'node',
	format: 'esm',
	target: 'node22',
	external: [
		'@kubernetes/client-node',
		'bgutils-js',
		'bufferutil',
		'discord-player',
		'discord-player-spotify',
		'discord.js',
		'jsdom',
		'sodium-native',
		'zlib-sync',

		// Dependencies incompatible with ESM bundling
		'@sentry/node',
		'pino',
		'ioredis',
		'ulid',
	],
	plugins: [
		esbuildPluginPino({ transports: [] }),
		...(process.env.SENTRY_RELEASE_NAME
			? [
					sentryEsbuildPlugin({
						authToken: process.env.SENTRY_AUTH_TOKEN,
						org: 'parsify-tech',
						project: 'discord-bot',
						telemetry: false,
						release: {
							name: process.env.SENTRY_RELEASE_NAME,
						},
					}),
				]
			: []),
	],
	outdir: 'dist',
	minify: true,
	sourcemap: true,
	define: {
		'process.env.GIT_COMMIT_SHA': JSON.stringify(
			process.env.SENTRY_RELEASE_NAME ?? '',
		),
	},
};

await esbuild.build(buildOptions);
