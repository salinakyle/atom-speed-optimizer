import IORedis from "ioredis";

declare global {
  var __redis__: IORedis | undefined;
}

function createRedisClient(): IORedis {
  const client = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null, // required by BullMQ
    enableReadyCheck: false,
    lazyConnect: true,
  });

  client.on("error", (err) => {
    console.error("[Redis]", err.message);
  });

  return client;
}

const redis: IORedis = global.__redis__ ?? createRedisClient();

if (process.env.NODE_ENV !== "production") {
  global.__redis__ = redis;
}

export { redis };
