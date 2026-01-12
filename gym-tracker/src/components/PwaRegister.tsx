"use client";

import { useEffect } from "react";

/**
 * En App Router, necesitamos ejecutar el registro del SW en el cliente.
 * Solo en producción, ya que next-pwa está deshabilitado en desarrollo.
 */
export function PwaRegister() {
    useEffect(() => {
        // Solo registrar el SW en producción
        if (process.env.NODE_ENV === "production") {
            import("next-pwa/register");
        }
    }, []);

    return null;
}



