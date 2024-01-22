import * as esbuild from 'esbuild';

await esbuild.build({
	entryPoints: ['src/index.ts'],
	bundle: true,
	platform: 'node',
	target: 'node20.10',
	external: [
		'ffmpeg-static',
		'ffmpeg-binaries',
		'@node-ffmpeg/node-ffmpeg-installer',
		'@ffmpeg-installer/ffmpeg',
		'@discord-player/extractor',
		'discord-player',
		'@evan/opus',
		'discord.js',
		'ytdl-core',
	],
	outfile: 'dist/index.js',
	minify: true,
});
