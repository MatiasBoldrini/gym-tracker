import { setTimeout as delay } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";
import { blockGoogleAuth } from "./block-google-auth.mjs";
import { syncOneSheet } from "../supabase/functions/_shared/block-sheet-sync.mjs";
import { googleSheets } from "../supabase/functions/_shared/block-workout-export.mjs";

const env = process.env;
const url = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
const secret = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !secret) throw new Error("Configurá SUPABASE_URL y SUPABASE_SECRET_KEY en el servidor.");
const supabase = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(20_000) }) },
});

const sheets = googleSheets(blockGoogleAuth());
const watch = process.argv.includes("--watch");
const stop = new AbortController();
for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => stop.abort());
let failures = 0;
let processed = 0;
while (!stop.signal.aborted) {
    let waitMs;
    try {
        const found = await syncOneSheet(supabase, sheets);
        if (found) processed++;
        failures = 0;
        if (!watch && !found) break;
        waitMs = found ? 1100 : 15_000;
    } catch (error) {
        // Google and HTTP clients can include Authorization headers and workout records in errors.
        const code = error.response?.status ?? error.cause?.code ?? "sin código";
        console.error("Falló la réplica de entrenamientos.", code,
            error.response ? "Google rechazó la operación." : error.message);
        if (!watch) { process.exitCode = 1; break; }
        failures++;
        waitMs = Math.min(300_000, 5000 * 2 ** Math.min(failures - 1, 6)) + Math.random() * 1000;
    }
    try { await delay(waitMs, undefined, { signal: stop.signal }); }
    catch (error) { if (!stop.signal.aborted) throw error; }
}
console.log("Registros procesados:", processed);
