type CacheEntry<T> = {
    value: T;
    expiresAt: number;
};

const cache = new Map<string, CacheEntry<unknown>>();

export async function withCache<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const hit = cache.get(key) as CacheEntry<T> | undefined;
    if (hit && hit.expiresAt > now) {
        return hit.value;
    }

    const value = await fn();
    cache.set(key, { value, expiresAt: now + ttlSeconds * 1000 });
    return value;
}
