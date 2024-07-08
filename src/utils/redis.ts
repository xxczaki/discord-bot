import { Redis } from 'ioredis';
import getEnvironmentVariable from './getEnvironmentVariable';

const redis = new Redis(getEnvironmentVariable('REDIS_URL'));

redis.options.family = 6;
redis.options.lazyConnect = true;

export default redis;
