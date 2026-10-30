import { captureException } from '@sentry/node';
import logger from './logger.ts';

export default function reportError(error: unknown, context?: string) {
	logger.error(error, context);
	captureException(error);
}
