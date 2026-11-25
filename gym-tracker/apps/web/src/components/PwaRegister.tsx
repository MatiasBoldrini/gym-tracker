import { useEffect, useRef, useState } from "react";
import { registerSW } from "virtual:pwa-register";
import { clearRuntimeDataCaches } from "@/lib/pwa";

export function PwaRegister() {
    const [needRefresh, setNeedRefresh] = useState(false);
    const updateServiceWorkerRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null);

    useEffect(() => {
        // `autoUpdate` en VitePWA hace que el SW busque updates solo,
        // pero en PWA instalada muchas veces el usuario no “refresca”.
        // Este handler permite mostrar un CTA y forzar activación + reload.
        const updateSW = registerSW({
            immediate: true,
            onNeedRefresh() {
                setNeedRefresh(true);
            },
        });
        updateServiceWorkerRef.current = updateSW;

        void clearRuntimeDataCaches();
    }, []);

    if (!needRefresh) return null;

    return (
        <div className="fixed top-0 left-0 right-0 z-[300] px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
            <div className="max-w-md mx-auto rounded-2xl bg-black text-white px-4 py-3 flex items-center justify-between gap-3 shadow-lg border border-white/10">
                <div className="text-sm font-bold leading-snug">
                    Hay una actualización disponible
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <button
                        type="button"
                        onClick={() => setNeedRefresh(false)}
                        className="px-3 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/15 active:translate-y-px transition"
                    >
                        Después
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            // Fuerza `skipWaiting` y recarga para tomar el SW nuevo ya.
                            void updateServiceWorkerRef.current?.(true);
                        }}
                        className="px-3 py-2 rounded-xl text-xs font-bold bg-white text-black hover:bg-white/90 active:translate-y-px transition"
                    >
                        Actualizar
                    </button>
                </div>
            </div>
        </div>
    );
}
