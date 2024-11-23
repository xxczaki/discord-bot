import { AudioFilters } from 'discord-player';

const CUSTOM_FILTERS: Array<{
	name: string;
	value: string;
}> = [
	{ name: '_normalizer', value: 'loudnorm=I=-14:LRA=11:TP=-1' },
	{ name: '_tempo05', value: 'atempo=0.5' },
	{ name: '_tempo075', value: 'atempo=0.75' },
	{ name: '_tempo125', value: 'atempo=1.25' },
	{ name: '_tempo15', value: 'atempo=1.5' },
	{ name: '_tempo175', value: 'atempo=1.75' },
	{ name: '_tempo2', value: 'atempo=2.0' },
];

export default function defineCustomFilters() {
	AudioFilters.defineBulk(CUSTOM_FILTERS);
}
