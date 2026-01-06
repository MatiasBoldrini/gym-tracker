"use client";

import { useEffect, useMemo, useState } from "react";

type SWInfo = {
    supported: boolean;
    controller: string | null;
    registration: {
        scope: string | null;
        active: string | null;
        waiting: string | null;
        installing: string | null;
        updateViaCache: string | null;
    } | null;
};

type CacheInfo = {
    keys: string[];
    entriesByCache: Record<string, number>;
    hasOfflineHtml: boolean;
};

function getDisplayMode(): string {
    if (typeof window === "undefined") return "unknown";
    // iOS Safari legacy flag
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nav: any = window.navigator;
    const standalone = typeof nav?.standalone === "boolean" ? nav.standalone : null;
    if (standalone === true) return "standalone(iOS)";
    if (standalone === false) return "browser(iOS)";
    if (window.matchMedia?.("(display-mode: standalone)")?.matches) return "standalone";
    return "browser";
}

export default function PwaDebugPage() {
    const [swInfo, setSwInfo] = useState<SWInfo | null>(null);
    const [cacheInfo, setCacheInfo] = useState<CacheInfo | null>(null);
    const [err, setErr] = useState<string | null>(null);

    const header = useMemo(() => {
        if (typeof window === "undefined") return null;
        return {
            href: window.location.href,
            origin: window.location.origin,
            displayMode: getDisplayMode(),
            onLine: navigator.onLine,
            userAgent: navigator.userAgent,
        };
    }, []);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            setErr(null);

            try {
                const supported = typeof navigator !== "undefined" && "serviceWorker" in navigator;
                let controller: string | null = null;
                let registration: SWInfo["registration"] = null;

                if (supported) {
                    controller = navigator.serviceWorker.controller?.scriptURL ?? null;
                    const reg = await navigator.serviceWorker.getRegistration();
                    registration = reg
                        ? {
                              scope: reg.scope ?? null,
                              active: reg.active?.scriptURL ?? null,
                              waiting: reg.waiting?.scriptURL ?? null,
                              installing: reg.installing?.scriptURL ?? null,
                              // eslint-disable-next-line @typescript-eslint/no-explicit-any
                              updateViaCache: ((reg as any).updateViaCache as string | undefined) ?? null,
                          }
                        : null;
                }

                if (!cancelled) {
                    setSwInfo({ supported, controller, registration });
                }

                // Cache Storage
                if (typeof caches !== "undefined") {
                    const keys = await caches.keys();
                    const entriesByCache: Record<string, number> = {};
                    for (const k of keys) {
                        try {
                            const c = await caches.open(k);
                            const reqs = await c.keys();
                            entriesByCache[k] = reqs.length;
                        } catch {
                            entriesByCache[k] = -1;
                        }
                    }

                    const offlineMatch = await caches.match("/offline.html", { ignoreSearch: true });

                    if (!cancelled) {
                        setCacheInfo({
                            keys,
                            entriesByCache,
                            hasOfflineHtml: !!offlineMatch,
                        });
                    }
                } else if (!cancelled) {
                    setCacheInfo({ keys: [], entriesByCache: {}, hasOfflineHtml: false });
                }
            } catch (e: any) {
                if (!cancelled) setErr(e?.message || String(e));
            }
        }

        load();
        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <div className="px-5 pt-8 pb-10">
            <header className="mb-6">
                <h1 className="text-2xl font-extrabold tracking-tight">PWA Debug</h1>
                <p className="text-ios-gray mt-1 text-sm font-medium uppercase tracking-wider">
                    Diagnóstico de Service Worker y Cache
                </p>
            </header>

            <div className="ios-card p-5 bg-white space-y-4">
                {err && (
                    <div className="rounded-2xl bg-red-50 px-3 py-2 text-xs text-red-700 border border-red-200">
                        {err}
                    </div>
                )}

                <section className="space-y-2">
                    <div className="text-sm font-black text-black">Contexto</div>
                    <div className="text-xs text-gray-600 space-y-1 break-words">
                        <div>href: {header?.href}</div>
                        <div>origin: {header?.origin}</div>
                        <div>displayMode: {header?.displayMode}</div>
                        <div>online: {String(header?.onLine)}</div>
                        <div>ua: {header?.userAgent}</div>
                    </div>
                </section>

                <section className="space-y-2">
                    <div className="text-sm font-black text-black">Service Worker</div>
                    {!swInfo ? (
                        <div className="text-xs text-gray-500">Cargando...</div>
                    ) : (
                        <div className="text-xs text-gray-600 space-y-1 break-words">
                            <div>supported: {String(swInfo.supported)}</div>
                            <div>controller: {swInfo.controller || "null"}</div>
                            <div>reg.scope: {swInfo.registration?.scope || "null"}</div>
                            <div>reg.active: {swInfo.registration?.active || "null"}</div>
                            <div>reg.waiting: {swInfo.registration?.waiting || "null"}</div>
                            <div>reg.installing: {swInfo.registration?.installing || "null"}</div>
                            <div>reg.updateViaCache: {swInfo.registration?.updateViaCache || "null"}</div>
                        </div>
                    )}
                </section>

                <section className="space-y-2">
                    <div className="text-sm font-black text-black">Cache Storage</div>
                    {!cacheInfo ? (
                        <div className="text-xs text-gray-500">Cargando...</div>
                    ) : (
                        <div className="text-xs text-gray-600 space-y-1 break-words">
                            <div>offline.html en cache: {String(cacheInfo.hasOfflineHtml)}</div>
                            <div>caches: {cacheInfo.keys.length}</div>
                            {cacheInfo.keys.map((k) => (
                                <div key={k}>
                                    {k}: {cacheInfo.entriesByCache[k]}
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="w-full py-3 rounded-2xl font-bold text-sm bg-black text-white hover:bg-black/90 active:translate-y-px transition"
                >
                    Recargar
                </button>
            </div>
        </div>
    );
}


