"use client";

import { useEffect } from "react";

/**
 * Registro manual del Service Worker para evitar el import de next-pwa/register
 * cuando el bundler no inyecta las constantes __PWA_* (p.ej. en dev).
 */
export function PwaRegister() {
    useEffect(() => {
        const isDemo = process.env.NEXT_PUBLIC_DEMO === "true";
        const isDev = process.env.NODE_ENV === "development";

        if (isDev || isDemo) return;
        if (typeof window === "undefined") return;
        if (!("serviceWorker" in navigator)) return;

        navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
            // Silencioso: no queremos bloquear la app si el SW falla.
        });
    }, []);

    return null;
}



