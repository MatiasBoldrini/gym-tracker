import { randomInt } from "node:crypto";
import { managedTab, newTabRequests, sheetExportBatch } from "./block-workout-export.mjs";
import { findDay, reconcileRow, SheetConflict } from "./block-sheet-row.mjs";
import { importBlockPlan } from "./block-plan-import.mjs";
import { readOriginalFeedback, writeOriginalFeedback } from "./block-original-feedback.mjs";

const quote = (name) => "'" + name.replaceAll("'", "''") + "'";
const fmt = (value) => String(value ?? "").trim();
function a1Column(n) {
    let value = "";
    while (n > 0) {
        n--;
        value = String.fromCharCode(65 + n % 26) + value;
        n = Math.floor(n / 26);
    }
    return value;
}
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function snapshot(raw) {
    const json = raw.slice(9, 26).join("");
    try {
        const base = json ? JSON.parse(json) : null;
        if (base && (!base.sets || typeof base.note !== "string")) throw Error();
        const count = /^chunks:(\d{1,2})$/.exec(raw[42] ?? "");
        const feedback = count ? raw.slice(43, 43 + Number(count[1])).join("") : raw[42];
        return { base, baseOriginal: feedback ? JSON.parse(feedback) : null };
    } catch {
        throw new SheetConflict("La copia interna de la sesión no es válida.");
    }
}
async function result(promise) {
    const { data, error } = await promise;
    if (error) throw Object.assign(new Error(error.message ?? "Error de Supabase"), { code: error.code });
    return data;
}
const params = (s) => ({ p_user_id: s.user_id, p_plan_id: s.plan_id, p_lease_token: s.lease_token });
function reasonRequest(sheetId, row, message) {
    return {
        updateCells: {
            range: {
                sheetId,
                startRowIndex: row - 1,
                endRowIndex: row,
                startColumnIndex: 8,
                endColumnIndex: 9,
            },
            rows: [{
                values: [
                    message
                        ? {
                            note: message + " Corregí la fila o escribí usar app / usar hoja en esta celda.",
                            userEnteredFormat: { backgroundColor: { red: 1, green: .85, blue: .63 } },
                        }
                        : {},
                ],
            }],
            fields: "note,userEnteredFormat.backgroundColor",
        },
    };
}
async function workoutRows(supabase, userId) {
    const all = [];
    for (let i = 0;; i += 500) {
        const page = await result(
            supabase.from("block_workouts").select("session_key,sheet_row,workout,revision,plan_id,user_id")
                .eq("user_id", userId).order("sheet_row").range(i, i + 499),
        );
        all.push(...page);
        if (page.length < 500) return all;
    }
}
function rowContext(ctx, number, raw, dbRow) {
    const override = fmt(raw[8]).toLowerCase() === "usar app";
    const identity = dbRow ? JSON.parse(dbRow.session_key) : raw.slice(0, 3);
    const { key, day, names } = findDay(ctx.plan.routine, identity);
    if (dbRow && raw.length && !override && findDay(ctx.plan.routine, raw).key !== key) {
        throw new SheetConflict("La fila corresponde a otra sesión. Conservá su bloque, semana y día.");
    }
    let saved;
    try {
        saved = snapshot(raw);
    } catch (error) {
        if (!override || !dbRow) throw error;
        saved = { base: null, baseOriginal: null };
    }
    const { base, baseOriginal } = saved;
    return {
        ...ctx,
        key,
        day,
        names,
        dbRow,
        raw,
        base,
        baseOriginal,
        zone: ctx.metadata.properties?.timeZone,
        captured: raw.length > 26 ? raw.slice(26, 34) : null,
        expected: raw.slice(34, 42),
        now: new Date().toISOString(),
        number,
    };
}

async function publish(ctx, job, raw, metadata, normalize = false) {
    const row = rowContext({ ...ctx, metadata }, job.sheet_row, raw, job);
    row.original = await readOriginalFeedback(row) ?? {};
    const reconciled = reconcileRow(row);
    if (!equal(reconciled, job.workout)) {
        throw new SheetConflict("Llegó otro cambio en la hoja antes de publicar.");
    }
    const original = await writeOriginalFeedback(row);
    const block = ctx.plan.routine.blocks.find((b) => b.id === JSON.parse(job.session_key)[0]);
    const batch = sheetExportBatch({ ...job, block_name: block?.name }, metadata, {
        expected: raw,
        normalize,
        original,
    });
    if (batch.length) await ctx.sheets.write(ctx.scan.spreadsheet_id, batch);
}

async function inspectSheet(supabase, sheets, scan) {
    const plan = await result(
        supabase.from("block_plans").select("user_id,plan_id,plan_revision,routine,spreadsheet_id")
            .eq("user_id", scan.user_id).eq("plan_id", scan.plan_id).eq("spreadsheet_id", scan.spreadsheet_id)
            .single(),
    );
    let metadata = await sheets.read(scan.spreadsheet_id);
    let tab = managedTab(metadata, scan.user_id);
    if (!tab) {
        await sheets.write(scan.spreadsheet_id, newTabRequests(randomInt(1, 2 ** 30), scan.user_id));
        metadata = await sheets.read(scan.spreadsheet_id);
        tab = managedTab(metadata, scan.user_id);
    }
    const ctx = { supabase, sheets, scan, metadata, plan, tab };
    const [workouts, conflicts, values] = await Promise.all([
        workoutRows(supabase, scan.user_id),
        result(
            supabase.from("block_sheet_conflicts").select("session_key,sheet_row,reason").eq(
                "user_id",
                scan.user_id,
            ),
        ),
        sheets.readValues(scan.spreadsheet_id, [
            quote(tab.properties.title) + "!A2:" +
            a1Column(Math.min(tab.properties.gridProperties.columnCount, 142)),
        ], "UNFORMATTED_VALUE"),
    ]);
    const byRow = new Map(workouts.map((w) => [w.sheet_row, w]));
    const rows = values[0]?.values ?? [];
    // A flat note on a day with a workout belongs to the athlete. AQ retains the
    // independent plan instruction even for old exports written without a divider.
    const feedbackBaselines = new Map();
    for (const w of workouts) {
        if (w.plan_id !== plan.plan_id) continue;
        let before;
        try {
            before = snapshot(rows[w.sheet_row - 2] ?? []).baseOriginal;
        } catch (error) {
            if (!(error instanceof SheetConflict)) throw error;
        }
        if (typeof before?.planNote === "string") {
            feedbackBaselines.set(w.session_key, { planNote: before.planNote });
            continue;
        }
        try {
            const { day } = findDay(plan.routine, JSON.parse(w.session_key));
            feedbackBaselines.set(w.session_key, { planNote: day.note });
        } catch (error) {
            if (!(error instanceof SheetConflict)) throw error;
        }
    }
    ctx.plan = await importBlockPlan({ ...ctx, feedbackBaselines });
    const rowNumbers = new Set([
        ...byRow.keys(),
        ...rows.map((_, i) => i + 2),
        ...conflicts.map((c) => c.sheet_row).filter(Boolean),
    ]);
    const notes = [];
    for (const number of rowNumbers) {
        const dbRow = byRow.get(number), raw = rows[number - 2] ?? [];
        const existing = conflicts.find((c) => c.sheet_row === number);
        let key = dbRow?.session_key ?? "row:" + number;
        try {
            if (dbRow || raw.some((v) => fmt(v) !== "")) {
                const row = rowContext(ctx, number, raw, dbRow);
                key = row.key;
                row.original = await readOriginalFeedback(row) ?? {};
                const next = reconcileRow(row);
                const changed = !dbRow || !equal(next, dbRow.workout);
                if (changed) {
                    await result(
                        supabase.rpc("apply_block_sheet_workout", {
                            ...params(scan),
                            p_session_key: key,
                            p_workout: next,
                            p_expected_revision: dbRow?.revision ?? 0,
                            p_sheet_row: number,
                        }),
                    );
                }
                // A manual resolution can choose exactly the already-delivered database version.
                if (
                    !changed &&
                    (/^usar (app|hoja)$/i.test(fmt(raw[8])) ||
                        row.base && (existing || row.original.needsBaseline))
                ) {
                    const fresh = await sheets.read(scan.spreadsheet_id);
                    await publish(
                        ctx,
                        { ...dbRow, user_id: scan.user_id, exercise_names: row.names },
                        raw,
                        fresh,
                        true,
                    );
                }
            }
            if (existing) {
                await result(
                    supabase.rpc("clear_block_sheet_conflict", {
                        ...params(scan),
                        p_session_key: existing.session_key,
                    }),
                );
                notes.push(reasonRequest(tab.properties.sheetId, number, null));
            }
        } catch (e) {
            if (!(e instanceof SheetConflict) && !["40001", "22023"].includes(e.code)) throw e;
            const reason = e instanceof SheetConflict
                ? e.message
                : "La sesión cambió o los datos no corresponden al plan.";
            if (existing?.reason !== reason || existing.session_key !== key) {
                await result(
                    supabase.rpc("record_block_sheet_conflict", {
                        ...params(scan),
                        p_session_key: key,
                        p_sheet_row: number,
                        p_reason: reason,
                    }),
                );
                notes.push(reasonRequest(tab.properties.sheetId, number, reason));
            }
        }
    }
    if (notes.length) await sheets.write(scan.spreadsheet_id, notes);
    return ctx;
}

async function deliver(ctx) {
    const { supabase, sheets, scan } = ctx;
    const jobs = await result(
        supabase.rpc("claim_block_workout_exports", { p_limit: 1, p_user_id: scan.user_id }),
    );
    const job = jobs[0];
    if (!job) return false;
    let failure;
    try {
        if (job.spreadsheet_id !== scan.spreadsheet_id) {
            throw new SheetConflict("Cambió la hoja asignada durante la sincronización.");
        }
        const metadata = await sheets.read(job.spreadsheet_id);
        const tab = managedTab(metadata, scan.user_id);
        if (!tab) throw new SheetConflict("La hoja de registros cambió. Se volverá a revisar.");
        const grid = tab.properties.gridProperties;
        let raw = [];
        if (job.sheet_row <= grid.rowCount) {
            const address = quote(tab.properties.title) + "!A" + job.sheet_row + ":" +
                a1Column(Math.min(grid.columnCount, 142)) + job.sheet_row;
            raw =
                (await sheets.readValues(job.spreadsheet_id, [address], "UNFORMATTED_VALUE"))[0]?.values?.[0] ??
                    [];
        }
        await publish(ctx, job, raw, metadata);
    } catch (e) {
        failure = e;
    }
    await result(
        supabase.rpc("finish_block_workout_export", {
            p_user_id: job.user_id,
            p_session_key: job.session_key,
            p_revision: job.revision,
            p_lease_token: job.lease_token,
            p_success: !failure,
        }),
    );
    if (failure && !(failure instanceof SheetConflict)) throw failure;
    return !failure;
}

// A lease is scoped to one athlete. Only export to that athlete after a successful import scan.
export async function syncOneSheet(supabase, sheets) {
    const scans = await result(supabase.rpc("claim_block_sheet_scans", { p_limit: 1 }));
    const scan = scans[0];
    if (!scan) return false;
    let ctx, failure;
    try {
        ctx = await inspectSheet(supabase, sheets, scan);
    } catch (e) {
        failure = e;
    }
    const held = await result(
        supabase.rpc("finish_block_sheet_scan", { ...params(scan), p_success: !failure }),
    );
    if (failure) throw failure;
    if (held) {
        for (let i = 0; i < 5; i++) {
            if (!await deliver(ctx)) break;
            await new Promise((resolve) => setTimeout(resolve, 1100));
        }
    }
    return true;
}
