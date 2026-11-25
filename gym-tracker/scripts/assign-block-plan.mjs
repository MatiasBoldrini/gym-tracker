import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { parseRoutine } from "../apps/web/src/pages/bloques/routine.ts";
import { readBlockRoutine } from "../supabase/functions/_shared/block-plan-import.mjs";
import { googleSheets, managedTab } from "../supabase/functions/_shared/block-workout-export.mjs";
import { blockGoogleAuth } from "./block-google-auth.mjs";

const usage = "Usá npm run assign:blocks -- <UUID> <enlace de Sheets>, <UUID> --sheet <ID> o <UUID> <rutina.json> [hoja de destino].";
export function sheetId(input) {
    if (/^[a-zA-Z0-9_-]+$/.test(input)) return input;
    let url;
    try { url = new URL(input); } catch { /* handled below */ }
    const match = url?.protocol === "https:" && url.hostname === "docs.google.com"
        && /^\/spreadsheets\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]+)(?:\/|$)/.exec(url.pathname);
    if (!match || match[1] === "e") throw new Error("Copiá el enlace de edición de Google Sheets o el ID de la planilla.");
    return match[1];
}

function sourceFrom(args) {
    const [userId, source, destination] = args;
    if (!userId || !source || args.length > 3) throw new Error(usage);
    if (!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(userId)) throw new Error("El identificador del atleta debe ser su UUID de Supabase Auth.");
    if (source === "--sheet") {
        if (!destination) throw new Error(usage);
        return { userId, spreadsheetId: sheetId(destination) };
    }
    if (/^https?:\/\//i.test(source)) {
        if (destination) throw new Error(usage);
        return { userId, spreadsheetId: sheetId(source) };
    }
    return { userId, file: source, spreadsheetId: destination ? sheetId(destination) : null };
}

export async function fromGoogle(sheets, spreadsheetId, userId) {
    const routine = { spreadsheetId, blocks: [], activation: [], catalog: [], rpe: { columns: [], rows: [] } };
    let parsed;
    try {
        const metadata = await sheets.read(spreadsheetId);
        managedTab(metadata, userId);
        parsed = await readBlockRoutine({ sheets, spreadsheetId, metadata, plan: { routine, plan_revision: 1 } });
    } catch (error) {
        const status = error.response?.status ?? error.code;
        if (status === 403 || status === 404)
            throw new Error("Google no dio acceso a la hoja. Verificá el enlace y compartila como editora con la cuenta de sincronización.");
        if (status === 401 || error.response?.data?.error === "invalid_grant")
            throw new Error("Google rechazó las credenciales de la cuenta de sincronización.");
        if (error.response) throw new Error("La lectura de Google Sheets falló (HTTP " + status + "). Volvé a intentar.");
        throw error;
    }
    if (!parsed?.blocks?.length)
        throw new Error("No encontré un bloque de Rutina Gym v4. Revisá los encabezados de semana, Día y Movimiento, y que haya al menos un ejercicio con series.");
    return parseRoutine(parsed);
}

// Validate the complete routine before creating an assignment, so a corrected sheet can be retried safely.
export async function assignBlockPlan(args, client, openSheets = () => googleSheets(blockGoogleAuth())) {
    const { userId, file, spreadsheetId } = sourceFrom(args);
    const routine = file ? parseRoutine(JSON.parse(await readFile(file, "utf8"))) : await fromGoogle(openSheets(), spreadsheetId, userId);
    const { error } = await client.from("block_plans").insert({ user_id: userId, auth_user_id: userId, routine, spreadsheet_id: spreadsheetId });
    if (error?.code === "23505") throw new Error("El atleta o la hoja ya tienen un plan asignado.");
    if (error?.code === "23503") throw new Error("El atleta todavía no existe en Supabase Auth.");
    if (error) throw new Error("No se pudo asignar el plan (" + error.code + ").");
    return routine;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
    try {
        const args = process.argv.slice(2);
        const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
        if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) throw new Error("Configurá SUPABASE_URL y SUPABASE_SECRET_KEY en el entorno del administrador.");
        const client = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
        const routine = await assignBlockPlan(args, client);
        console.log("Plan asignado. Bloques:", routine.blocks.length);
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
