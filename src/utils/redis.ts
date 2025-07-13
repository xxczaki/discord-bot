import { Redis } from 'ioredis';
import getEnvironmentVariable from './getEnvironmentVariable';

/* v8 ignore start */
const redis = new Redis(getEnvironmentVariable('REDIS_URL'));

export default redis;
/* v8 ignore stop */
