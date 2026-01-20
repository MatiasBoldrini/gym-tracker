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
        const cache = await caches.open("exercise-images");
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

/**
 * Borra caches de datos (APIs) manejadas por Workbox.
 *
 * Importante:
 * - El cache key NO incluye el header Authorization, así que puede quedar cacheado un 401
 *   de "antes del login" y seguir devolviéndose.
 * - También evita "leaks" de datos entre usuarios si se loguea otro usuario en el mismo device.
 */
export async function clearRuntimeDataCaches() {
    if (typeof window === "undefined") return { ok: false as const, reason: "no-window" as const };
    if (!("caches" in window)) return { ok: false as const, reason: "no-cache" as const };

    // Nota: nombres de caches pueden variar entre versiones del SW (Workbox).
    // Para evitar que quede un 401/response vieja “pegada”, borramos caches que claramente no son assets.
    const keep = new Set(["exercise-images", "static-images"]);
    const keys = await caches.keys();
    const results = await Promise.all(
        keys.map(async (name) => {
            if (keep.has(name)) return { name, deleted: false, skipped: true as const };
            const looksLikeRuntimeDataCache = /(api|workbox|runtime|sheets|fatiga|bodymap)/i.test(name);
            if (!looksLikeRuntimeDataCache) return { name, deleted: false, skipped: true as const };
            try {
                const deleted = await caches.delete(name);
                return { name, deleted };
            } catch {
                return { name, deleted: false };
            }
        })
    );

    return { ok: true as const, results };
}




