import { Redis } from 'ioredis';
import getEnvironmentVariable from './getEnvironmentVariable';

const redis = new Redis(getEnvironmentVariable('REDIS_URL'));

export default redis;
