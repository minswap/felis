import type * as OgmiosSchema from "@cardano-ogmios/schema";
import type Redis from "ioredis";

export enum RedisKey {
  INTERSECTION_CANDIDATES = "intersection_candidates",
  LAST_SYNC_SLOT = "last_sync_slot",
}

export namespace RedisRepo {
  export const getIntersectionCandidates = async (redis: Redis) => {
    const data = await redis.lrange(RedisKey.INTERSECTION_CANDIDATES, 0, -1);
    if (!data) {
      return [];
    }
    return data.map((d) => JSON.parse(d));
  };

  export const rollbackIntersectionCandidates = async (redis: Redis, point: OgmiosSchema.PointOrOrigin) => {
    if (point === "origin") {
      await redis.del(RedisKey.INTERSECTION_CANDIDATES);
      return;
    }
    const slot = point.slot;
    const intersectionCandidates = await RedisRepo.getIntersectionCandidates(redis);
    let pop_count = 0;
    let foundIntersectionCandidate = false;
    for (let index = 0; index < intersectionCandidates.length; index++) {
      if (intersectionCandidates[index].slot <= slot) {
        pop_count = index;
        foundIntersectionCandidate = true;
        break;
      }
    }
    if (!foundIntersectionCandidate) {
      await redis.del(RedisKey.INTERSECTION_CANDIDATES);
    } else {
      if (pop_count > 0) {
        await redis.lpop(RedisKey.INTERSECTION_CANDIDATES, pop_count);
      }
    }
  };

  export const pushIntersectionCandidate = async (redis: Redis, block: { slot: number; id: string }) => {
    const key = RedisKey.INTERSECTION_CANDIDATES;
    const currentLength = await redis.llen(key);
    const multi = redis.multi();
    if (currentLength >= 2160) {
      multi.rpop(key);
    }
    const point: OgmiosSchema.Point = {
      slot: block.slot,
      id: block.id,
    };
    multi.lpush(key, JSON.stringify(point));
    await multi.exec();
  };

  export const set = (redis: Redis, key: RedisKey, value: string | number) => {
    return redis.set(key, value);
  };
}
