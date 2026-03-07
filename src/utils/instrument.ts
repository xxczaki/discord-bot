import * as Sentry from '@sentry/node';
import getEnvironmentVariable from './getEnvironmentVariable';

const IGNORED_ERROR_PATTERNS = [
	'The operation was aborted',
	'Opening handshake has timed out',
];

/* v8 ignore start */
Sentry.init({
	dsn: getEnvironmentVariable('SENTRY_DSN'),
	tracesSampleRate: 1.0,
	beforeSend(event) {
		const message = event.exception?.values?.[0]?.value ?? '';

		if (IGNORED_ERROR_PATTERNS.some((pattern) => message.includes(pattern))) {
			return null;
		}

		return event;
	},
});
/* v8 ignore stop */
