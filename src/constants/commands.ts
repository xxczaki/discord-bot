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
				name: 'track_id',
				description: 'Position of the track you want to remove',
				type: 4,
				required: true,
			},
		],
	},
	{
		name: 'move',
		description: 'Moves track in the queue to a different position.',
		options: [
			{
				name: 'from',
				description: 'Initial position',
				type: 4,
				required: true,
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
		description: 'Get information about the current queue.',
		options: [
			{
				name: 'page_number',
				description:
					'Which page of the queue to display, defaults to the first one',
				type: 4,
			},
		],
	},
	{
		name: 'shuffle',
		description: 'Shuffles the queue.',
	},
	{
		name: 'loop',
		description: 'Loop controls.',
		options: [
			{
				name: 'loop_mode',
				description: 'Mode of the loop you want to use',
				type: 4,
				choices: [
					{ name: 'off', value: 0 },
					{ name: 'track', value: 1 },
					{ name: 'queue', value: 2 },
					{ name: 'autoplay', value: 3 },
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
		name: 'playlist',
		description: 'Allows enqueuening multiple songs in one go.',
		options: [
			{
				name: 'id',
				description: 'Optional identifier of the playlist from #listy-piosenek',
				type: 3,
				autocomplete: true,
			},
		],
	},
	{
		name: 'deduplicate',
		description: 'Removes duplicates from the queue (based on the URLs).',
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
		description: 'Toggle an audio filter.',
		options: [
			{
				name: 'audio_filter',
				description: 'The filter you want to toggle',
				type: 3,
				choices: [
					{ name: 'Bassboost', value: 'bassboost' },
					{ name: 'Earrape', value: 'earrape' },
					{ name: 'Lofi', value: 'lofi' },
					{ name: 'Nightcore', value: 'nightcore' },
					{ name: 'Vaporwave', value: 'vaporwave' },
				],
			},
		],
	},
	{
		name: 'tempo',
		description: 'Sets the tempo of the player.',
		options: [
			{
				name: 'value',
				description: 'Desired tempo, base is 1',
				type: 10,
				minValue: 0,
				maxValue: 2,
				required: true,
			},
		],
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
];

export default COMMANDS;
