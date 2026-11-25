import { timingSafeEqual, createHash } from "node:crypto";
import { createClient } from "npm:@supabase/supabase-js@2.90.1";
import { JWT, OAuth2Client } from "npm:google-auth-library@10.5.0";
import { syncOneSheet } from "../_shared/block-sheet-sync.mjs";
import { googleSheets } from "../_shared/block-workout-export.mjs";

const env = (name: string) => Deno.env.get(name);
const digest = (text: string) => createHash("sha256").update(text).digest();

function googleClient() {
    const json = env("GOOGLE_SERVICE_ACCOUNT_JSON");
    if (json) {
        const account = JSON.parse(json);
        if (account.type !== "service_account" || !account.client_email || !account.private_key)
            throw new Error("Cuenta de servicio de Google incompleta.");
        return new JWT({ email: account.client_email, key: account.private_key,
            scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
    }
    const clientId = env("GOOGLE_CLIENT_ID");
    const clientSecret = env("GOOGLE_CLIENT_SECRET");
    const refreshToken = env("GOOGLE_REFRESH_TOKEN");
    if (!clientId || !clientSecret || !refreshToken) throw new Error("Falta configurar la credencial de Google.");
    const auth = new OAuth2Client(clientId, clientSecret);
    auth.setCredentials({ refresh_token: refreshToken });
    return auth;
}

Deno.serve(async request => {
    if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
    const expected = env("BLOCK_EXPORT_CRON_SECRET");
    if (!expected || !timingSafeEqual(digest(request.headers.get("x-cron-secret") ?? ""), digest(expected)))
        return new Response(null, { status: 403 });

    try {
        const projectKey = JSON.parse(env("SUPABASE_SECRET_KEYS") ?? "{}").default ?? env("SUPABASE_SERVICE_ROLE_KEY");
        const supabase = createClient(env("SUPABASE_URL")!, projectKey, {
            auth: { persistSession: false, autoRefreshToken: false },
            global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15_000) }) },
        });
        const sheets = googleSheets(googleClient());
        // Leave room for a slow last Google request; any unclaimed sessions stay durably queued.
        const deadline = Date.now() + 30_000;
        let processed = 0;
        while (Date.now() < deadline && processed < 10 && await syncOneSheet(supabase, sheets)) {
            processed++;
            await new Promise(resolve => setTimeout(resolve, 1100));
        }
        return Response.json({ processed });
    } catch (error) {
        const status = (error as { response?: { status?: number } })?.response?.status;
        console.error("Fallo en réplica de entrenamientos", status ?? "revisar credenciales, cola y acceso a la hoja");
        return Response.json({ error: "No se completó la réplica." }, { status: 503 });
    }
});
