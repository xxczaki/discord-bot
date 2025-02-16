import type { ApplicationCommandData } from 'discord.js';

const COMMANDS: ApplicationCommandData[] = [
	{
		name: 'play',
		description: 'Plays some music.',
		options: [
			{
				name: 'query',
				description: 'Query to use to search for your song',
				type: 3,
				required: true,
				autocomplete: true,
			},
		],
	},
	{
		name: 'pause',
		description: 'Pauses the queue.',
	},
	{
		name: 'resume',
		description: 'Resumes the queue.',
	},
	{
		name: 'skip',
		description: 'Skips the current track.',
	},
	{
		name: 'remove',
		description: 'Removes track from the queue.',
		options: [
			{
				name: 'query',
				description: 'The track you want to remove',
				type: 3,
				required: true,
				autocomplete: true,
			},
		],
	},
	{
		name: 'move',
		description: 'Moves track in the queue to a different position.',
		options: [
			{
				name: 'query',
				description: 'The track that should be moved',
				type: 3,
				required: true,
				autocomplete: true,
			},
			{
				name: 'to',
				description: 'Desired position',
				type: 4,
				required: true,
			},
		],
	},
	{
		name: 'queue',
		description: "Checks what's currently playing and what will play next.",
	},
	{
		name: 'shuffle',
		description: 'Shuffles the queue.',
	},
	{
		name: 'repeat',
		description: 'Controls the repeat mode.',
		options: [
			{
				name: 'repeat_mode',
				description: 'The desired repeat mode',
				type: 4,
				choices: [
					{ name: 'off', value: 0 },
					{ name: 'track', value: 1 },
					{ name: 'queue', value: 2 },
				],
				required: true,
			},
		],
	},
	{
		name: 'volume',
		description: 'Sets the volume of the player.',
		options: [
			{
				name: 'value',
				description: 'Desired volume, base is 100',
				type: 4,
				minValue: 0,
				required: true,
			},
		],
	},
	{
		name: 'purge',
		description: 'Purges the queue.',
	},
	{
		name: 'debug',
		description: 'Shows debug information.',
	},
	{
		name: 'playlists',
		description:
			'Allows enqueuening multiple songs in one go, using the playlists from from #listy-piosenek.',
	},
	{
		name: 'deduplicate',
		description: 'Removes duplicates from the queue.',
		options: [
			{
				name: 'algorithm',
				description: 'The deduplication algorithm',
				type: 3,
				choices: [
					{ name: 'Bridged URL exactness', value: 'bridged' },
					{ name: 'Source URL exactness (legacy)', value: 'source' },
				],
				required: true,
			},
		],
	},
	{
		name: 'sort',
		description: 'Sorts queue in an alphabetical order.',
	},
	{
		name: 'stats',
		description: 'Shows certain statistics regarding bot usage.',
	},
	{
		name: 'filters',
		description: 'Allows toggling the audio filters.',
	},
	{
		name: 'tempo',
		description: 'Allows changing the playback speed of the player.',
	},
	{
		name: 'lateness',
		description: 'Measures lateness.',
		options: [
			{
				name: 'expected_hour',
				description: 'Expected hour, formatted as HH:mm',
				type: 3,
			},
		],
	},
	{
		name: 'flush_query_cache',
		description: 'Flushes the internal query cache.',
	},
	{
		name: 'avatar',
		description: "Fetches and displays user's avatar.",
		options: [
			{
				name: 'user',
				description: 'The user whose avatar you want to preview',
				type: 6,
				required: true,
			},
		],
	},
	{
		name: 'tic_tac_toe',
		description: 'Allows you to play Tic-tac-toe with the bot itself.',
	},
	{
		name: 'recover',
		description: 'Attempts to recover a queue – useful in case of an error.',
	},
	{
		name: 'opus_cache',
		description: 'Fetches information about the Opus file cache.',
	},
];

export default COMMANDS;
