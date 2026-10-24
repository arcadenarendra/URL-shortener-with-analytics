import { beforeEach, describe, expect, it, vi } from "vitest";

const redisClient = {
  del: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
};

vi.mock("../src/config/redis.js", () => ({
  getConnectedRedisClient: vi.fn(async () => redisClient),
}));

const {
  cacheUrl,
  getCachedUrl,
  invalidateUrlCache,
} = await import("../src/services/cache.service.js");

describe("cache service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("REDIS_CACHE_TTL_SECONDS", "3600");
  });

  it("reads valid cached mappings", async () => {
    redisClient.get.mockResolvedValue(
      JSON.stringify({
        id: "url-id",
        originalUrl: "https://example.com",
        isActive: true,
        expiresAt: null,
      }),
    );

    await expect(getCachedUrl("abc1234")).resolves.toMatchObject({
      id: "url-id",
      originalUrl: "https://example.com",
    });
    expect(redisClient.get).toHaveBeenCalledWith("url:abc1234");
  });

  it("deletes expired cached mappings instead of serving them", async () => {
    redisClient.get.mockResolvedValue(
      JSON.stringify({
        id: "url-id",
        originalUrl: "https://example.com",
        isActive: true,
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      }),
    );

    await expect(getCachedUrl("abc1234")).resolves.toBeNull();
    expect(redisClient.del).toHaveBeenCalledWith("url:abc1234");
  });

  it("bounds cache TTL by the link expiration", async () => {
    redisClient.set.mockResolvedValue("OK");
    const expiresAt = new Date(Date.now() + 5000);

    await cacheUrl("abc1234", {
      _id: "url-id",
      originalUrl: "https://example.com",
      isActive: true,
      expiresAt,
    });

    const ttl = redisClient.set.mock.calls[0][2].EX;
    expect(ttl).toBeGreaterThanOrEqual(1);
    expect(ttl).toBeLessThanOrEqual(5);
  });

  it("invalidates a mapping after an owned URL change", async () => {
    await invalidateUrlCache("abc1234");

    expect(redisClient.del).toHaveBeenCalledWith("url:abc1234");
  });
});
