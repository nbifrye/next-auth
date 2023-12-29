import { createStorage, defineDriver } from "unstorage"
import { runBasicTests } from "utils/adapter"
import { hydrateDates, UnstorageAdapter } from "../src"
import "dotenv/config"
import { createClient } from "redis"
import type { RedisClientType, RedisClientOptions } from "redis"

globalThis.crypto ??= require("node:crypto").webcrypto

const redisJSONDriver = defineDriver((options: RedisClientOptions) => {
  let redisClient: RedisClientType
  const getRedisClient = async () => {
    if (!redisClient) {
      // @ts-ignore
      redisClient = await createClient(options)
        .on("error", (err) => console.log("Redis Client Error", err))
        .connect()
      return redisClient
    }
    if (!redisClient.isReady) await redisClient.connect()
    return redisClient
  }

  return {
    name: "redis-json-driver",
    options,
    async hasItem(key, _opts) {
      return Boolean(await (await getRedisClient()).exists(key))
    },
    async getItem(key, _opts) {},
    async setItem(key, value, _opts) {},
    async getItemRaw(key, _opts) {
      const value = await (await getRedisClient()).json.get(key)
      return value ?? null
    },
    async setItemRaw(key, value, _opts) {
      let ttl = _opts?.ttl
      if (ttl) {
        await (await getRedisClient()).json.set(key, "$", value)
        await (await getRedisClient()).expire(key, ttl)
      } else {
        await (await getRedisClient()).json.set(key, "$", value)
      }
    },
    async removeItem(key, _opts) {
      await (await getRedisClient()).del(key)
    },
    async getKeys(base, _opts) {
      return await (await getRedisClient()).keys("*")
    },
  }
})

const storage = createStorage({
  driver: redisJSONDriver({
    username: "default",
  }),
})

runBasicTests({
  adapter: UnstorageAdapter(storage, { baseKeyPrefix: "testApp:" }),
  db: {
    disconnect: storage.dispose,
    async user(id: string) {
      const data = await storage.getItemRaw<object>(`testApp:user:${id}`)
      if (!data) return null
      return hydrateDates(data)
    },
    async account({ provider, providerAccountId }) {
      const data = await storage.getItemRaw<object>(
        `testApp:user:account:${provider}:${providerAccountId}`
      )
      if (!data) return null
      return hydrateDates(data)
    },
    async session(sessionToken) {
      const data = await storage.getItemRaw<object>(
        `testApp:user:session:${sessionToken}`
      )
      if (!data) return null
      return hydrateDates(data)
    },
    async verificationToken(where) {
      const data = await storage.getItemRaw<object>(
        `testApp:user:token:${where.identifier}:${where.token}`
      )
      if (!data) return null
      return hydrateDates(data)
    },
  },
})
