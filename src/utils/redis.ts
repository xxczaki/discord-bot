import { Redis } from 'ioredis';
import getEnvironmentVariable from './getEnvironmentVariable';

const redis = new Redis(getEnvironmentVariable('REDIS_URL'));

redis.options.family = 6;

export default redis;
