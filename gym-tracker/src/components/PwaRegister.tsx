"use client";

/**
 * En App Router, necesitamos ejecutar el registro del SW en el cliente.
 * next-pwa expone esto vía side-effect import.
 */
import "next-pwa/register";

export function PwaRegister() {
    return null;
}


