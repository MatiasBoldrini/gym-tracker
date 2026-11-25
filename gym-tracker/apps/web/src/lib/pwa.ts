/**
 * Cacheo selectivo de URLs en el Cache Storage (PWA).
 * Útil para imágenes de la rutina sin precache masivo.
 */
export async function cacheUrls(urls: string[]) {
    if (typeof window === "undefined") return { ok: false as const, reason: "no-window" as const };
    if (!("caches" in window)) return { ok: false as const, reason: "no-cache" as const };

    const unique = Array.from(new Set((urls || []).map((u) => (u || "").trim()).filter(Boolean)));
    if (unique.length === 0) return { ok: true as const, cached: 0 };

    try {
        const cache = await caches.open("exercise-images-v2");
        let cached = 0;
        await Promise.all(
            unique.map(async (url) => {
                try {
                    const existing = await cache.match(url, { ignoreSearch: true });
                    if (existing) return;
                    await cache.add(url);
                    cached += 1;
                } catch {
                    // best-effort
                }
            })
        );

        return { ok: true as const, cached };
    } catch {
        return { ok: false as const, reason: "error" as const };
    }
}

/** Elimina las respuestas privadas que cacheaban versiones anteriores de la PWA. */
export async function clearRuntimeDataCaches() {
    if (typeof window === "undefined" || !("caches" in window)) return;
    await Promise.allSettled([
        caches.delete("sheets-api-cache"),
        caches.delete("fatiga-api-cache"),
        caches.delete("bodymap-api-cache"),
    ]);
}
