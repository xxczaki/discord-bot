import * as Sentry from '@sentry/node';
import getEnvironmentVariable from './getEnvironmentVariable';

/* v8 ignore start */
Sentry.init({
	dsn: getEnvironmentVariable('SENTRY_DSN'),
	tracesSampleRate: 1.0,
});
/* v8 ignore stop */
