export default function snakeToCamelCase(string: string): string {
	return string.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}
