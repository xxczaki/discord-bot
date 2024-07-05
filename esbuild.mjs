import * as esbuild from 'esbuild';
import esbuildPluginPino from 'esbuild-plugin-pino';

await esbuild.build({
	entryPoints: ['src/index.ts'],
	bundle: true,
	platform: 'node',
	target: 'node20.10',
	external: [
		'@discord-player/extractor',
		'@discordjs/opus',
		'bufferutil',
		'discord-player',
		'discord.js',
		'sodium-native',
		'utf-8-validate',
		'ytdl-core',
	],
	plugins: [esbuildPluginPino({ transports: [] })],
	outdir: 'dist',
	minify: true,
});
