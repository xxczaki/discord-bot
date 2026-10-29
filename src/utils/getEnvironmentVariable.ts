import memoize from 'memoize';

type EnvironmentVariableNames =
	| 'TOKEN'
	| 'CLIENT_ID'
	| 'REDIS_URL'
	| 'NODE_ENV'
	| 'BOT_DEBUG_CHANNEL_ID'
	| 'GUILD_CONFIG';

function getEnvironmentVariable(name: EnvironmentVariableNames) {
	const rawVariable = process.env[name];

	if (typeof rawVariable === 'undefined') {
		throw new TypeError(`Missing environment variable: ${name}`);
	}

	return rawVariable;
}

export default memoize(getEnvironmentVariable);
