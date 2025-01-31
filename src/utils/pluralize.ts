export default function pluralize(ifOne: string, ifMany: string) {
	return (strings: TemplateStringsArray, ...expressions: unknown[]) => {
		const value = expressions.find(
			(expression) => typeof expression === 'number',
		);

		if (typeof value === 'undefined') {
			throw new TypeError('Incorrect use of `pluralize`');
		}

		return String.raw(
			{ raw: strings },
			...expressions.map((expression) => {
				if (expression === null) {
					return value === 1 ? ifOne : ifMany;
				}

				return expression;
			}),
		);
	};
}
