import pino, { type Logger } from 'pino';
import type { LokiOptions } from 'pino-loki';

let logger: Logger;

const host = process.env.LOKI_HOST;
const username = process.env.LOKI_USERNAME;
const password = process.env.LOKI_PASSWORD;

if (host && username && password) {
	const transport = pino.transport<LokiOptions>({
		target: 'pino-loki',
		options: {
			batching: true,
			interval: 5,

			host,
			basicAuth: {
				username,
				password,
			},
		},
	});

	logger = pino(transport);
}

logger = pino({ level: 'debug' });

export default logger;
