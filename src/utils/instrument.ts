import * as Sentry from '@sentry/node';
import getEnvironmentVariable from './getEnvironmentVariable';

Sentry.init({
	dsn: getEnvironmentVariable('SENTRY_DSN'),
	tracesSampleRate: 1.0,
});
