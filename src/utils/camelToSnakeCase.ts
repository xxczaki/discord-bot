export default function camelToSnakeCase(string: string): string {
	return string.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}
