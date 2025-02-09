import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import getEnvironmentVariable from './getEnvironmentVariable';

Sentry.init({
	dsn: getEnvironmentVariable('SENTRY_DSN'),
	integrations: [nodeProfilingIntegration()],
	tracesSampleRate: 1.0,
	profilesSampleRate: 1.0,
});

Sentry.profiler.startProfiler();

// Exporting only to silence an esbuild warning
export default Sentry;
