import { useEffect } from "react";
import { registerSW } from "virtual:pwa-register";

export function PwaRegister() {
    useEffect(() => {
        registerSW({ immediate: true });
        // Limpieza best-effort de caches viejas de Sheets.
        // Aunque el SW nuevo no cachee /api/sheets/*, un SW viejo pudo haber dejado entries en `sheets-api-cache`.
        // Si quedan, pueden confundir debugging y en algunos casos seguir afectando durante el período de transición.
        if (typeof window !== "undefined" && "caches" in window) {
            void caches.delete("sheets-api-cache");
        }
    }, []);

    return null;
}



