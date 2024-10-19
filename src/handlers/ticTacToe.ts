import { randomInt } from 'node:crypto';
import {
	ActionRowBuilder,
	ButtonBuilder,
	type ButtonInteraction,
	ButtonStyle,
	type CacheType,
	type ChatInputCommandInteraction,
} from 'discord.js';

const GRID_SIZE = 3;
const EMPTY_CHARACTER = '‎';

export default async function ticTacToeCommandHandler(
	interaction: ChatInputCommandInteraction<CacheType>,
) {
	const rows = await getRows([], []);
	const response = await interaction.reply({
		content:
			"The game begins and it's your turn. Choose where to place your symbol:",
		components: rows,
		ephemeral: true,
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

	for (let i = 0; i < GRID_SIZE; i++) {
		for (let j = 0; j < GRID_SIZE; j++) {
			result.push(`${i}-${j}`);
		}
	}

	return result;
}

function getWinningSequences() {
	const sequences: string[][] = [];

	const ascendingDiagonal: string[][] = [];

	for (let i = 0; i < GRID_SIZE; i++) {
		sequences.push(
			allPositions.filter((position) => position.startsWith(`${i}`)),
		);
		sequences.push(
			allPositions.filter((position) => position.endsWith(`${i}`)),
		);

		ascendingDiagonal.push(
			allPositions.filter(
				(position) =>
					position.startsWith(`${i}`) &&
					position.endsWith(`${GRID_SIZE - 1 - i}`),
			),
		);
	}

	sequences.push(ascendingDiagonal.flat());

	sequences.push(
		allPositions.filter(
			(position) => position[0] === position[position.length - 1],
		),
	);

	return sequences;
}

const allPositions = getAllPositions();
const winningSequences = getWinningSequences();

async function getRows(xPositions: string[], oPositions: string[]) {
	const rows: ActionRowBuilder<ButtonBuilder>[] = [];
	for (let i = 0; i < GRID_SIZE; i++) {
		const actionRow = new ActionRowBuilder<ButtonBuilder>();

		for (let j = 0; j < GRID_SIZE; j++) {
			const id = `${i}-${j}`;
			const label = getLabel(id, xPositions, oPositions);

			actionRow.addComponents(
				new ButtonBuilder()
					.setCustomId(id)
					.setLabel(label)
					.setStyle(ButtonStyle.Secondary)
					.setDisabled(label !== EMPTY_CHARACTER),
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
		return '⭕';
	}

	return EMPTY_CHARACTER;
}

function getPossiblePositions(xPositions: string[], oPositions: string[]) {
	return allPositions.filter(
		(position) =>
			!xPositions.includes(position) && !oPositions.includes(position),
	);
}

async function getOPositions(xPositions: string[], oPositions: string[]) {
	const possiblePositions = getPossiblePositions(xPositions, oPositions);

	for (const position of possiblePositions) {
		const merged = [...oPositions, position];

		if (isGameOverByWin(merged)) {
			return merged;
		}
	}

	return [
		...oPositions,
		possiblePositions[randomInt(0, possiblePositions.length - 1)],
	];
}

function isGameOverByWin(positions: string[]) {
	if (positions.length < 3) {
		return false;
	}

	return winningSequences.find((sequence) =>
		sequence.every((position) => positions.includes(position)),
	);
}

async function nextMove(
	interaction: ButtonInteraction<CacheType>,
	xPositions: string[],
	oPositions: string[],
) {
	if (isGameOverByWin(xPositions)) {
		await interaction.update({
			content: 'Game over, you won – congrats!',
			components: [],
		});
		return;
	}

	const possiblePositions = getPossiblePositions(xPositions, oPositions);

	if (possiblePositions.length === 0) {
		await interaction.update({
			content: 'Game over, draw.',
			components: [],
		});
		return;
	}

	const newOPositions = await getOPositions(xPositions, oPositions);

	if (isGameOverByWin(newOPositions)) {
		await interaction.update({
			content: 'Game over, I won – you fucking loser.',
			components: [],
		});
		return;
	}

	if (newOPositions.length === 0) {
		await interaction.update({
			content: 'Game over, draw.',
			components: [],
		});
		return;
	}

	const rows = await getRows(xPositions, newOPositions);
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
			await nextMove(answer, [...xPositions, answer.customId], newOPositions);
		}
	} catch {
		await interaction.editReply({
			components: [],
		});
	}
}
