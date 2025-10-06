import type { ChatInputApplicationCommandData } from 'discord.js';

export const COMMAND_CATEGORIES = [
	'Music',
	'Utilities',
	'Fun',
	'Other',
	'Owner-only',
] as const;

export type CategorizedCommand = ChatInputApplicationCommandData & {
	category: (typeof COMMAND_CATEGORIES)[number];
};

export const RAW_COMMANDS: CategorizedCommand[] = [
	{
		name: 'play',
		description: 'Search for music on Spotify or YouTube and play it',
		options: [
			{
				name: 'query',
				description:
					'Spotify search query (prefix with "youtube:" to browse YouTube instead)',
				type: 3,
				required: true,
				autocomplete: true,
			},
		],
		category: 'Music',
	},
	{
		name: 'pause',
		description: 'Pause the queue',
		category: 'Music',
	},
	{
		name: 'resume',
		description: 'Resume the queue',
		category: 'Music',
	},
	{
		name: 'skip',
		description: 'Skip the current track',
		category: 'Music',
	},
	{
		name: 'remove',
		description: 'Remove selected track from the queue',
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
		description: 'Move track in the queue to a different position',
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
		description: "Check what's currently playing and what will play next",
		category: 'Music',
	},
	{
		name: 'shuffle',
		description: 'Shuffle the queue',
		category: 'Music',
	},
	{
		name: 'repeat',
		description: 'Control the repeat mode',
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
		description: 'Set the volume of the player',
		options: [
			{
				name: 'value',
				description: 'Desired volume, base is 100',
				type: 4,
				minValue: 10,
				maxValue: 1000,
				required: true,
			},
		],
		category: 'Music',
	},
	{
		name: 'purge',
		description: 'Purge the queue',
		category: 'Music',
	},
	{
		name: 'debug',
		description: 'Display debug information',
		category: 'Other',
	},
	{
		name: 'playlists',
		description:
			'Enqueue multiple songs in one go, using the playlists from a dedicated channel',
		options: [
			{
				name: 'playlist1',
				description: 'First playlist to enqueue',
				type: 3,
				required: true,
				autocomplete: true,
			},
			{
				name: 'playlist2',
				description: 'Second playlist to enqueue (optional)',
				type: 3,
				required: false,
				autocomplete: true,
			},
			{
				name: 'playlist3',
				description: 'Third playlist to enqueue (optional)',
				type: 3,
				required: false,
				autocomplete: true,
			},
			{
				name: 'playlist4',
				description: 'Fourth playlist to enqueue (optional)',
				type: 3,
				required: false,
				autocomplete: true,
			},
			{
				name: 'playlist5',
				description: 'Fifth playlist to enqueue (optional)',
				type: 3,
				required: false,
				autocomplete: true,
			},
		],
		category: 'Music',
	},
	{
		name: 'head',
		description: 'Play the first N songs from a playlist',
		options: [
			{
				name: 'playlist',
				description: 'The playlist to play from',
				type: 3,
				required: true,
				autocomplete: true,
			},
			{
				name: 'count',
				description: 'Number of songs to play',
				type: 4,
				minValue: 1,
				maxValue: 100,
				required: true,
			},
		],
		category: 'Music',
	},
	{
		name: 'tail',
		description: 'Play the last N songs from a playlist',
		options: [
			{
				name: 'playlist',
				description: 'The playlist to play from',
				type: 3,
				required: true,
				autocomplete: true,
			},
			{
				name: 'count',
				description: 'Number of songs to play',
				type: 4,
				minValue: 1,
				maxValue: 100,
				required: true,
			},
		],
		category: 'Music',
	},
	{
		name: 'deduplicate',
		description: 'Remove duplicates from the queue',
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
		description: 'Sort queue in an alphabetical order',
		category: 'Music',
	},
	{
		name: 'stats',
		description: 'Show certain statistics regarding the bot usage',
		category: 'Music',
	},
	{
		name: 'filters',
		description: 'Toggle the audio filters',
		category: 'Music',
	},
	{
		name: 'tempo',
		description: 'Change playback speed of the player',
		category: 'Music',
	},
	{
		name: 'lateness',
		description: "Measure someone's lateness",
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
		name: 'cache',
		description: 'View cache statistics and manage cache types',
		category: 'Other',
	},
	{
		name: 'avatar',
		description: "Fetch and display user's avatar",
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
		description: 'Play Tic-tac-toe with the bot itself',
		category: 'Fun',
	},
	{
		name: 'recover',
		description: 'Recover a recently played queue',
		category: 'Music',
	},
	{
		name: 'help',
		description: 'Shos the available commands and their purpose',
		category: 'Other',
	},
	{
		name: 'maintenance',
		description: "Activate maintenance mode by deleting the bot's deployment",
		category: 'Owner-only',
	},
	{
		name: 'lockdown',
		description: 'Toggle lockdown mode for certain commands',
		category: 'Owner-only',
	},
	{
		name: 'prompt',
		description: 'Control the queue with natural language',
		options: [
			{
				name: 'prompt',
				description:
					'e.g., "remove all bob dylan songs" or "move genesis tracks to the front and play now"',
				type: 3,
				required: true,
			},
		],
		category: 'Music',
	},
];

export default RAW_COMMANDS.map(({ category, ...rest }) => rest);
