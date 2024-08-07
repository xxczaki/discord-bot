type EnvironmentVariableNames =
	| 'TOKEN'
	| 'CLIENT_ID'
	| 'REDIS_URL'
	| 'NODE_ENV'
	| 'SENTRY_DSN';

export default function getEnvironmentVariable(name: EnvironmentVariableNames) {
	const rawVariable = process.env[name];

	if (typeof rawVariable === 'undefined') {
		throw new TypeError(`Missing environment variable: ${name}`);
	}

	return rawVariable;
}
