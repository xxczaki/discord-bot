import { getRandomValues } from 'node:crypto';

export default function cryptoRandom() {
	const typedArray = new Uint8Array(1);
	const randomValue = getRandomValues(typedArray)[0];
	const randomFloat = randomValue / 2 ** 8;

	return randomFloat;
}
