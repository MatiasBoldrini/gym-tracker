/**
 * Helper para pedirle al Service Worker (Workbox) que cachee URLs específicas.
 * next-pwa incluye un listener de mensajes "CACHE_URLS".
 *
 * Útil para cachear selectivamente assets (p.ej. imágenes de la rutina) sin precachear todo el catálogo.
 */
export async function cacheUrls(urls: string[]) {
    if (typeof window === "undefined") return { ok: false as const, reason: "no-window" as const };
    if (!("serviceWorker" in navigator)) return { ok: false as const, reason: "no-sw" as const };

    const unique = Array.from(new Set((urls || []).map((u) => (u || "").trim()).filter(Boolean)));
    if (unique.length === 0) return { ok: true as const, cached: 0 };

    try {
        const reg = await navigator.serviceWorker.ready;
        const sw = reg.active || reg.waiting || reg.installing;
        if (!sw) return { ok: false as const, reason: "no-active-sw" as const };

        // Workbox responderá por MessageChannel cuando termine el CACHE_URLS.
        const result = await new Promise<boolean>((resolve) => {
            const channel = new MessageChannel();
            const timeout = setTimeout(() => resolve(false), 2500);

            channel.port1.onmessage = () => {
                clearTimeout(timeout);
                resolve(true);
            };

            sw.postMessage(
                {
                    type: "CACHE_URLS",
                    payload: { urlsToCache: unique },
                },
                [channel.port2]
            );
        });

        return { ok: result as true, cached: unique.length };
    } catch {
        return { ok: false as const, reason: "error" as const };
    }
}


