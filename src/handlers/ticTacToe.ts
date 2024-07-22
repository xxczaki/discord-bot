import {
	ActionRowBuilder,
	ButtonBuilder,
	type ButtonInteraction,
	ButtonStyle,
	type CacheType,
	type ChatInputCommandInteraction,
} from 'discord.js';

const EMPTY_GRID = [
	[null, null, null],
	[null, null, null],
	[null, null, null],
];

export default async function ticTacToeCommandHandler(
	interaction: ChatInputCommandInteraction<CacheType>,
) {
	const rows = await getRows([], []);
	const response = await interaction.editReply({
		content:
			"The game begins and it's your turn. Choose where to place your `❌`:",
		components: rows,
	});

	try {
		const answer = await response.awaitMessageComponent({
			time: 60_000, // 1 minute
		});

		if (answer.isButton()) {
			await nextMove(answer, [answer.customId], []);
		}
	} catch {
		await interaction.editReply({
			components: [],
		});
	}
}

function getAllPositions() {
	const result: string[] = [];

	for (let i = 0; i < EMPTY_GRID.length; i++) {
		for (let j = 0; j < EMPTY_GRID[i].length; j++) {
			result.push(`${i}-${j}`);
		}
	}

	return result;
}

async function getRows(
	xPositions: string[],
	oPositions: string[],
	interaction?: ButtonInteraction<CacheType>,
) {
	const rows: ActionRowBuilder<ButtonBuilder>[] = [];

	if (interaction) {
		const possiblePositions = getAllPositions().filter(
			(position) =>
				!xPositions.includes(position) || !oPositions.includes(position),
		);

		if (possiblePositions.length === 0) {
			await interaction.update({
				content: 'Game finished, draw.',
				components: [],
			});
		}

		oPositions.push(
			possiblePositions[Math.floor(Math.random() * possiblePositions.length)],
		);

		const possiblePositionsNext = getAllPositions().filter(
			(position) =>
				!xPositions.includes(position) || !oPositions.includes(position),
		);

		if (possiblePositionsNext.length === 0) {
			await interaction.update({
				content: 'Game finished, draw.',
				components: [],
			});
		}
	}

	for (let i = 0; i < EMPTY_GRID.length; i++) {
		const actionRow = new ActionRowBuilder<ButtonBuilder>();

		for (let j = 0; j < EMPTY_GRID[i].length; j++) {
			const id = `${i}-${j}`;

			actionRow.addComponents(
				new ButtonBuilder()
					.setCustomId(id)
					.setLabel(getLabel(id, xPositions, oPositions))
					.setStyle(ButtonStyle.Secondary),
			);
		}

		rows.push(actionRow);
	}

	return rows;
}

function getLabel(id: string, xPositions: string[], oPositions: string[]) {
	if (xPositions.includes(id)) {
		return '❌';
	}

	if (oPositions.includes(id)) {
		return '○';
	}

	return '‎';
}

async function nextMove(
	interaction: ButtonInteraction<CacheType>,
	xPositions: string[],
	oPositions: string[],
) {
	const rows = await getRows(xPositions, oPositions, interaction);
	const response = await interaction.update({
		content:
			'I made my move, your turn again. Choose where to place your `❌`:',
		components: rows,
	});

	try {
		const answer = await response.awaitMessageComponent({
			time: 60_000, // 1 minute
		});

		if (answer.isButton()) {
			await nextMove(answer, [...xPositions, answer.customId], oPositions);
		}
	} catch {
		await interaction.editReply({
			components: [],
		});
	}
}
