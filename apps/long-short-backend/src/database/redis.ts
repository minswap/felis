import { Redis, type RedisOptions } from "ioredis";

export function newRedis(url: string, connectionName: string, options?: RedisOptions): Redis {
  const redis = new Redis(url, {
    ...options,
    db: 0,
    connectionName,
    enableReadyCheck: true,
    maxRetriesPerRequest: 10,
    showFriendlyErrorStack: false,
    retryStrategy(times): number {
      return Math.min(times * 10, 2000);
    },
  });
  return redis;
}
