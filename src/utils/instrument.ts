import * as Sentry from '@sentry/node';

const IGNORED_ERROR_PATTERNS = [
	'The operation was aborted',
	'Opening handshake has timed out',
];

/* v8 ignore start */
const dsn = process.env.SENTRY_DSN;

if (dsn) {
	Sentry.init({
		dsn,
		tracesSampleRate: 1.0,
		initialScope: {
			tags: {
				'bot.fly_app': process.env.FLY_APP_NAME,
			},
		},
		beforeSend(event) {
			const message = event.exception?.values?.[0]?.value ?? '';

			if (IGNORED_ERROR_PATTERNS.some((pattern) => message.includes(pattern))) {
				return null;
			}

			return event;
		},
	});
}
/* v8 ignore stop */
