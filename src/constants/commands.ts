import type { ChatInputApplicationCommandData } from 'discord.js';

export const COMMAND_CATEGORIES = [
	'Music',
	'Utilities',
	'Fun',
	'Other',
] as const;

export type CategorizedCommand = ChatInputApplicationCommandData & {
	category: (typeof COMMAND_CATEGORIES)[number];
};

export const RAW_COMMANDS: CategorizedCommand[] = [
	{
		name: 'play',
		description: 'Plays some music.',
		options: [
			{
				name: 'query',
				description:
					'Spotify search query (prefix with "youtube:" to search YouTube instead)',
				type: 3,
				required: true,
				autocomplete: true,
			},
		],
		category: 'Music',
	},
	{
		name: 'pause',
		description: 'Pauses the queue.',
		category: 'Music',
	},
	{
		name: 'resume',
		description: 'Resumes the queue.',
		category: 'Music',
	},
	{
		name: 'skip',
		description: 'Skips the current track.',
		category: 'Music',
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
		category: 'Music',
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
		category: 'Music',
	},
	{
		name: 'queue',
		description: "Checks what's currently playing and what will play next.",
		category: 'Music',
	},
	{
		name: 'shuffle',
		description: 'Shuffles the queue.',
		category: 'Music',
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
		category: 'Music',
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
		category: 'Music',
	},
	{
		name: 'purge',
		description: 'Purges the queue.',
		category: 'Music',
	},
	{
		name: 'debug',
		description: 'Shows debug information.',
		category: 'Other',
	},
	{
		name: 'playlists',
		description:
			'Allows enqueuening multiple songs in one go, using the playlists from a dedicated channel.',
		category: 'Music',
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
		category: 'Music',
	},
	{
		name: 'sort',
		description: 'Sorts queue in an alphabetical order.',
		category: 'Music',
	},
	{
		name: 'stats',
		description: 'Shows certain statistics regarding bot usage.',
		category: 'Music',
	},
	{
		name: 'filters',
		description: 'Allows toggling the audio filters.',
		category: 'Music',
	},
	{
		name: 'tempo',
		description: 'Allows changing the playback speed of the player.',
		category: 'Music',
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
		category: 'Utilities',
	},
	{
		name: 'flush_query_cache',
		description: 'Flushes the internal query cache.',
		category: 'Other',
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
		category: 'Utilities',
	},
	{
		name: 'tic_tac_toe',
		description: 'Allows you to play Tic-tac-toe with the bot itself.',
		category: 'Fun',
	},
	{
		name: 'recover',
		description: 'Attempts to recover a queue – useful in case of an error.',
		category: 'Music',
	},
	{
		name: 'opus_cache',
		description: 'Fetches information about the Opus file cache.',
		category: 'Other',
	},
	{
		name: 'help',
		description: 'Shows the available commands and their purpose.',
		category: 'Other',
	},
];

export default RAW_COMMANDS.map(({ category, ...rest }) => rest);
