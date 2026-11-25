import { createClient } from "@supabase/supabase-js";

export const accountPrefix = "gym:blocks:" + import.meta.env.VITE_SUPABASE_URL + ":";
const storageKey = accountPrefix + "sheet-link";
export type PlanAccess = { id: string; planId: string; token: string };

// Some WebKit streams remain pending after receiving headers. Bound the parsed query as well as the network request.
export async function routineRequest<T>(parent: AbortSignal, send: (signal: AbortSignal) => PromiseLike<T>): Promise<T> {
    if (parent.aborted) throw new DOMException("Solicitud cancelada", "AbortError");
    const controller = new AbortController();
    const abort = () => controller.abort();
    const timer = setTimeout(abort, 15_000);
    parent.addEventListener("abort", abort, { once: true });
    try {
        const cancelled = new Promise<never>((_, reject) => controller.signal.addEventListener("abort", () =>
            reject(new DOMException("Solicitud interrumpida", "AbortError")), { once: true }));
        return await Promise.race([cancelled, send(controller.signal)]);
    } finally {
        clearTimeout(timer);
        parent.removeEventListener("abort", abort);
    }
}

export function linkedClient(token: string) {
    return createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY, {
        // The publishable key uses the anonymous DB role. The sheet link scopes its reads and writes.
        accessToken: async () => null,
        global: { headers: { "x-gym-routine": token }, fetch: (input, init) =>
            fetch(input, { ...init, cache: "no-store", redirect: "error" }) },
    });
}

export function rememberedAccess(): PlanAccess | null {
    for (const name of ["sessionStorage", "localStorage"] as const) {
        try {
            const value = JSON.parse(window[name].getItem(storageKey) ?? "null");
            if (value?.id && value.planId && typeof value.token === "string" && /^[a-f0-9]{64}$/.test(value.token)) return value;
        } catch { /* The shared link also works when browser storage is unavailable. */ }
    }
    return null;
}

export function rememberAccess(access: PlanAccess) {
    for (const name of ["sessionStorage", "localStorage"] as const) {
        try { window[name].setItem(storageKey, JSON.stringify(access)); } catch { /* Keep the link in memory. */ }
    }
}

export function forgetAccess(token: string) {
    try { sessionStorage.setItem(recentKey, JSON.stringify(recentTemplates().filter(item => item.token !== token))); } catch { /* Optional tab history. */ }
    for (const name of ["sessionStorage", "localStorage"] as const) {
        try {
            if (JSON.parse(window[name].getItem(storageKey) ?? "null")?.token === token) window[name].removeItem(storageKey);
        } catch { /* Another tab can keep its own routine. */ }
    }
}

export type TemplateEntry = PlanAccess & { title: string; spreadsheetId?: string };
const recentKey = storageKey + ":recent";

export function recentTemplates(): TemplateEntry[] {
    try {
        const entries: unknown = JSON.parse(sessionStorage.getItem(recentKey) ?? "[]");
        return Array.isArray(entries) ? entries.filter(item => item && typeof item.title === "string" &&
            typeof item.id === "string" && typeof item.planId === "string" && /^[a-f0-9]{64}$/.test(item.token)) : [];
    } catch { return []; }
}

export function rememberTemplate(entry: TemplateEntry) {
    const entries = recentTemplates().filter(item => item.id !== entry.id || item.planId !== entry.planId);
    try { sessionStorage.setItem(recentKey, JSON.stringify([entry, ...entries])); } catch { /* Optional tab history. */ }
}

export function templateAppOrigin() {
    return import.meta.env.VITE_BLOCKS_APP_ORIGIN || (import.meta.env.DEV || import.meta.env.VITE_BLOCKS_CLOUD !== "true"
        ? "https://gym-tracker-hojas.vercel.app" : window.location.origin);
}

export function templateLink(token: string) {
    return new URL("/bloques#rutina=" + token, templateAppOrigin()).href;
}

export function templateSheetLink(id?: string) {
    return id && /^[a-zA-Z0-9_-]+$/.test(id) ? "https://docs.google.com/spreadsheets/d/" + id + "/edit" : undefined;
}

export function templateToken(input: string, entries: TemplateEntry[]) {
    let url: URL;
    try { url = new URL(input.trim()); } catch { throw new Error("Pegá el enlace completo de la plantilla."); }
    if (!url.username && !url.password) {
        if (url.origin === "https://docs.google.com") {
            const sheet = /^\/spreadsheets\/(?:u\/\d+\/)?d\/([\w-]+)(?:\/|$)/.exec(url.pathname)?.[1];
            const known = sheet && entries.find(entry => entry.spreadsheetId === sheet);
            if (known) return known.token;
            if (sheet) throw new Error("Para abrir esta hoja por primera vez, pegá su enlace de entrenamiento de Gym Tracker.");
        } else if ((url.origin === window.location.origin || url.origin === templateAppOrigin()) && /^\/bloques(?:\/|$)/.test(url.pathname)) {
            const token = new URLSearchParams(url.hash.slice(1)).get("rutina") ?? "";
            if (/^[a-f0-9]{64}$/.test(token)) return token;
        }
    }
    throw new Error("Usá el enlace privado que aparece en Compartir plantilla.");
}

export async function lookupAccess(token: string, signal: AbortSignal): Promise<PlanAccess | null> {
    const { data, error } = await routineRequest(signal, abort => linkedClient(token).from("block_plans")
        .select("user_id,plan_id").abortSignal(abort).maybeSingle());
    if (error) throw error;
    return data ? { token, id: data.user_id, planId: data.plan_id } : null;
}
