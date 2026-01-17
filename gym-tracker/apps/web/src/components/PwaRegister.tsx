import { useEffect } from "react";
import { registerSW } from "virtual:pwa-register";

export function PwaRegister() {
    useEffect(() => {
        registerSW({ immediate: true });
    }, []);

    return null;
}



