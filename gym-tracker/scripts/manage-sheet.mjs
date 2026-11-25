import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { sheetId, fromGoogle } from "./assign-block-plan.mjs";
import { blockGoogleAuth } from "./block-google-auth.mjs";
import { googleSheets } from "../supabase/functions/_shared/block-workout-export.mjs";

function adminClient() {
    let url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) {
        const ref = readFileSync(new URL("../supabase/.temp/project-ref", import.meta.url), "utf8").trim();
        const keys = JSON.parse(execFileSync("supabase", ["projects", "api-keys", "--project-ref", ref, "--reveal", "-o", "json"], { stdio: ["ignore", "pipe", "ignore"] }));
        url = "https://" + ref + ".supabase.co";
        key = keys.find(k => k.type === "secret")?.api_key;
    }
    if (!key) throw new Error("Vinculá la CLI de Supabase al proyecto o configurá las credenciales de administración.");
    return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function ownerSheets() {
    const env = { ...process.env };
    if (process.platform === "darwin" && !env.GOOGLE_SERVICE_ACCOUNT_JSON && !env.GOOGLE_APPLICATION_CREDENTIALS && !env.GOOGLE_REFRESH_TOKEN) {
        const service = env.GYM_GOOGLE_KEYCHAIN_SERVICE || "Gym Tracker v4 · Google Sheets";
        env.GOOGLE_SERVICE_ACCOUNT_JSON = execFileSync("/usr/bin/security", ["find-generic-password", "-s", service, "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    }
    return googleSheets(blockGoogleAuth(env));
}

export async function manageSheet(client, sheet, action, openSheets = ownerSheets) {
    if (!["open", "rotate", "revoke"].includes(action)) throw new Error("Operación de enlace desconocida.");
    const id = sheetId(sheet);
    const read = () => client.from("block_plans").select("plan_id").eq("spreadsheet_id", id).maybeSingle();
    const { data, error } = await read();
    if (error) throw new Error("No se pudo consultar la asignación.");
    if (!data) {
        if (action !== "open") throw new Error("Esa hoja todavía no está asignada.");
        const owner = randomUUID();
        const routine = await fromGoogle(openSheets(), id, owner);
        const { error: insertError } = await client.from("block_plans").insert({ user_id: owner, spreadsheet_id: id, routine });
        if (insertError && !(insertError.code === "23505" && (await read()).data)) throw new Error("No se pudo asignar la hoja (" + insertError.code + ").");
    }
    const result = await client.rpc("manage_block_plan_link", { p_sheet: id, p_action: action });
    if (result.error) throw new Error("No se pudo administrar el enlace (" + result.error.code + ").");
    return result.data;
}

export function appLink(origin, token) {
    const url = new URL(origin);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || /^192\.168\.\d{1,3}\.\d{1,3}$/.test(url.hostname);
    if (!(url.protocol === "https:" || (local && url.protocol === "http:")) || url.username || url.password || url.origin === "null")
        throw new Error("Usá el origen HTTPS de tu app o su dirección de red local.");
    if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("No se recibió un enlace válido.");
    return new URL("/bloques#rutina=" + token, url.origin).href;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
    let terminal;
    try {
        try { process.loadEnvFile(new URL("../.env.admin.local", import.meta.url)); } catch (e) { if (e.code !== "ENOENT") throw e; }
        const [command, sheetArg, ...extra] = process.argv.slice(2);
        if (extra.length || (command && !["abrir", "renovar", "revocar"].includes(command))) throw new Error("Usá abrir, renovar o revocar seguido del enlace de Google Sheets.");
        const action = { abrir: "open", renovar: "rotate", revocar: "revoke" }[command || "abrir"];
        const origin = process.env.GYM_APP_ORIGIN;
        if (action !== "revoke") {
            if (!origin) throw new Error("Configurá GYM_APP_ORIGIN en .env.admin.local con la dirección que usarán tus atletas.");
            appLink(origin, "0".repeat(64));
        }
        if (!sheetArg) terminal = createInterface({ input: process.stdin, output: process.stdout });
        const sheet = (sheetArg ?? await terminal.question("Pegá el enlace de Google Sheets: ")).trim();
        const token = await manageSheet(adminClient(), sheet, action);
        if (!token) console.log("Enlace revocado. Los entrenamientos siguen guardados.");
        else {
            const url = appLink(origin, token);
            if (terminal && process.platform === "darwin") {
                execFileSync("/usr/bin/pbcopy", [], { input: url });
                console.log("Enlace privado copiado. Pegalo en el mensaje para quien usa esa rutina.");
            } else console.log(url);
        }
    } catch (e) { console.error(e.message); process.exitCode = 1; }
    finally { terminal?.close(); }
}
