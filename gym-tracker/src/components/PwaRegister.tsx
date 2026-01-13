"use client";

/**
 * En App Router, necesitamos ejecutar el registro del SW en el cliente.
 * next-pwa expone esto vía side-effect import.
 * next-pwa maneja internamente el disable en desarrollo.
 */

// @ts-ignore - next-pwa/register no tiene tipos de TypeScript
import "next-pwa/register";

export function PwaRegister() {
    return null;
}



