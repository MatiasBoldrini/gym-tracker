import { isDeepStrictEqual } from "node:util";
import { createHash } from "node:crypto";

class PlanConflict extends Error {}

const clean = value => String(value ?? "").trim();
const fold = value => clean(value).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ");
export const quoteTab = title => "'" + title.replaceAll("'", "''") + "'";
export function columnName(index) {
    let name = "";
    for (let col = index + 1; col; col = Math.floor((col - 1) / 26)) name = String.fromCharCode(65 + (col - 1) % 26) + name;
    return name;
}
export function cellRating(value) {
    const text = clean(value);
    if (!text || /^(?:0|☆+|sin calificar)$/i.test(text)) return null;
    if (/^[1-3]$/.test(text)) return Number(text);
    if (/^★{1,3}☆{0,2}$/u.test(text) && text.length <= 3) return (text.match(/★/gu) ?? []).length;
    throw new PlanConflict("Calificación desconocida en la pestaña de bloques.");
}

export const feedbackDivider = "── Registro del entrenamiento ──";
export function splitFeedback(value) {
    const text = clean(value);
    const lines = text.split(/\r?\n/);
    const marker = lines.indexOf(feedbackDivider);
    return marker < 0 ? { planNote: text, workoutNote: "", separated: false } : {
        planNote: lines.slice(0, marker).join("\n").trim(),
        workoutNote: lines.slice(marker + 1).join("\n").trim(), separated: true,
    };
}

function weekColumns(row) {
    return row.flatMap((cell, column) => {
        const match = /^(?:week|semana)\s*(\d+)$/i.exec(clean(cell));
        return match ? [{ number: Number(match[1]), column }] : [];
    });
}
const dayHeader = row => /^(?:dia|día)\s*(\d+)$/i.exec(clean(row[0]));
const groupByName = rows => {
    const names = new Map();
    for (const row of rows) {
        const k = fold(row.name);
        if (!names.has(k)) names.set(k, []);
        names.get(k).push(row);
    }
    return names;
};

function assignIdentities(block, day, rows, revision) {
    const before = new Map();
    for (const week of block.weeks) {
        for (const ex of week.days.find(d => d.number === day)?.exercises ?? []) {
            let old = before.get(ex.id);
            if (!old) {
                const legacyRow = /-(\d+)$/.exec(ex.id);
                old = { id: ex.id, name: ex.name, row: ex.sourceRow ?? (legacyRow ? Number(legacyRow[1]) : null), weeks: {} };
                before.set(ex.id, old);
            }
            old.weeks[week.number] = [ex.effort, ex.prescription, ex.load];
        }
    }
    const prior = groupByName(before.values());
    const taken = new Set(before.keys());
    for (const [name, current] of groupByName(rows)) {
        let old = [...(prior.get(name) ?? [])];
        const match = (entry, previous) => { entry.id = previous.id; old = old.filter(x => x !== previous); };
        // Full week signatures distinguish e.g. the top set from a second, lighter set of the same lift.
        for (const entry of current) {
            const same = old.filter(x => isDeepStrictEqual(x.weeks, entry.weeks));
            if (same.length === 1 && current.filter(x => isDeepStrictEqual(x.weeks, entry.weeks)).length === 1) match(entry, same[0]);
        }
        const unmatched = current.filter(x => !x.id);
        if (unmatched.length === 1 && old.length === 1) match(unmatched[0], old[0]);
        else if (unmatched.length && old.length) {
            const stable = unmatched.length === old.length && unmatched.every(x =>
                old.some(y => y.row === x.row && isDeepStrictEqual(x.weeks, y.weeks)));
            if (!stable) throw new PlanConflict("No se puede asociar con certeza un ejercicio repetido después de mover o editar filas.");
            for (const x of unmatched) match(x, old.find(y => y.row === x.row));
        }
        for (const entry of current.filter(x => !x.id)) {
            const positional = block.id + "-" + day + "-" + entry.row;
            const suffix = createHash("sha256").update(JSON.stringify([revision, entry.row, name])).digest("hex").slice(0, 12);
            // A newly inserted lift may occupy the old physical row of a different lift.
            entry.id = before.size ? positional + "-" + suffix : positional;
            if (taken.has(entry.id)) throw new PlanConflict("Identidad duplicada de ejercicio en la programación.");
            taken.add(entry.id);
        }
    }
}

export function parseBlock(rows, tab, previous, revision, id = previous?.id ?? tab.title) {
    const block = { id, name: tab.title, startDate: clean(rows[0]?.[0]), sourceSheetId: tab.sheetId, weeks: [] };
    const days = [];
    let columns = [];
    let weekRow = 0;
    let day;
    let seenHeader = false;
    for (const [index, row] of rows.entries()) {
        const columnsHere = weekColumns(row);
        if (columnsHere.length) {
            if (new Set(columnsHere.map(c => c.number)).size !== columnsHere.length) throw new PlanConflict("Número de semana duplicado.");
            columns = columnsHere;
            weekRow = index;
            day = undefined;
            continue;
        }
        const header = dayHeader(row);
        if (header && fold(row[1]) === "movimiento" && columns.length) {
            const number = Number(header[1]);
            if (days.some(d => d.number === number)) throw new PlanConflict("Número de día duplicado en la programación.");
            seenHeader = true;
            day = { number, header: index, weekRow, columns, rows: [], notes: new Map() };
            days.push(day);
            continue;
        }
        if (!day) continue;
        for (const { number, column } of day.columns) {
            if (/^nota\s*:?$/i.test(clean(row[column]))) {
                if (day.notes.has(number)) throw new PlanConflict("Dos filas de nota para el mismo día y semana.");
                const note = clean(row[column + 1]);
                day.notes.set(number, {
                    sheetId: tab.sheetId, rowIndex: index, noteColumnIndex: column + 1, ratingColumnIndex: column + 2,
                    dayHeaderRowIndex: day.header, weekHeaderRowIndex: day.weekRow, note, rating: cellRating(row[column + 2]),
                });
            }
        }
        const name = clean(row[1]);
        if (!name) continue;
        const weeks = {};
        for (const { number, column } of day.columns) {
            const prescription = clean(row[column + 1]);
            if (prescription) weeks[number] = [clean(row[column]), prescription, clean(row[column + 2])];
        }
        if (Object.keys(weeks).length) day.rows.push({ name, row: index + 1, weeks });
    }
    if (!seenHeader) return null;
    const weeks = new Map();
    for (const d of days) {
        assignIdentities(previous ?? block, d.number, d.rows, revision);
        for (const { number } of d.columns) {
            if (!weeks.has(number)) weeks.set(number, { number, days: [] });
            const feedback = d.notes.get(number);
            const exercises = d.rows.filter(ex => ex.weeks[number]).map(ex => {
                const [effort, prescription, load] = ex.weeks[number];
                return { id: ex.id, name: ex.name, effort, prescription, load, sourceRow: ex.row };
            });
            weeks.get(number).days.push({ number: d.number, exercises, note: splitFeedback(feedback?.note).planNote,
                rating: feedback?.rating ?? null, ...(feedback && { sheetFeedback: feedback }) });
        }
    }
    block.weeks = Array.from(weeks.values()).filter(w => w.days.some(d => d.exercises.length || d.note || d.rating !== null));
    return block.weeks.length ? block : null;
}

function parseActivation(rows) {
    const groups = [];
    let group;
    for (const [name, exercise, sets, reps] of rows) {
        if (clean(name) && fold(exercise) === "ejercicios") {
            group = { name: clean(name), exercises: [] };
            groups.push(group);
        } else if (group && clean(exercise)) {
            group.exercises.push({ name: clean(exercise), sets: clean(sets), reps: clean(reps) });
        }
    }
    return groups;
}
function parseRpe(rows) {
    const number = value => value === undefined || clean(value) === "" ? NaN : Number(clean(value).replace(",", "."));
    const columns = (rows[0] ?? []).slice(1).map(number);
    const values = rows.slice(1).filter(row => row.some(clean)).map(row => row.map(number));
    if (!columns.length || !columns.every(Number.isFinite) ||
        values.some(row => row.length !== columns.length + 1 || !row.every(Number.isFinite))) throw new PlanConflict("Tabla RPE incompleta.");
    return { columns, rows: values };
}

export async function readBlockRoutine({ sheets, spreadsheetId, metadata, plan, feedbackBaselines }) {
    const { routine } = plan;
    const candidates = (metadata.sheets ?? []).map(tab => tab.properties).filter(tab =>
        (!tab.sheetType || tab.sheetType === "GRID") && !["plantilla", "registro app"].includes(fold(tab.title)));
    const unavailable = () => {
        if (routine.blocks.some(b => b.sourceSheetId != null)) throw new PlanConflict("Ya no se encuentra la programación de los bloques vinculados a este plan.");
        return routine;
    };
    if (!candidates.length) return unavailable();
    const auxiliary = new Set(["activacion", "variables", "rpe"]);
    const range = (t, maxCol, maxRow) => quoteTab(t.title) + "!A1:" +
        columnName(Math.min(t.gridProperties.columnCount, maxCol) - 1) + Math.min(t.gridProperties.rowCount, maxRow);
    // Inspect only headers on unrelated tabs. Detailed reads cover the accepted template tabs.
    const headers = await sheets.readValues(spreadsheetId, candidates.map(t => range(t, 32, 12)));
    const selected = candidates.filter((t, i) => auxiliary.has(fold(t.title)) ||
        routine.blocks.some(b => b.sourceSheetId === t.sheetId || fold(b.name) === fold(t.title)) ||
        (headers[i]?.values ?? []).some(row => weekColumns(row).length));
    if (!selected.length) return unavailable();
    const values = await sheets.readValues(spreadsheetId, selected.map(t => {
        const title = fold(t.title);
        return range(t, title === "variables" ? 2 : title === "activacion" ? 4 : t.gridProperties.columnCount, t.gridProperties.rowCount);
    }));
    const next = { ...routine, blocks: [] };
    const seen = new Set();
    for (const [index, tab] of selected.entries()) {
        const grid = values[index]?.values ?? [];
        switch (fold(tab.title)) {
        case "activacion": next.activation = parseActivation(grid); continue;
        case "variables": next.catalog = grid.slice(1).filter(row => clean(row[0])).map(row => ({ name: clean(row[0]), muscle: clean(row[1]) })); continue;
        case "rpe": next.rpe = parseRpe(grid); continue;
        }
        const old = routine.blocks.find(b => b.sourceSheetId === tab.sheetId)
            ?? routine.blocks.find(b => b.sourceSheetId == null && [b.name, b.id].some(n => fold(n) === fold(tab.title)));
        let id = old?.id ?? tab.title;
        if (!old && routine.blocks.some(b => b.id === id)) id += "-" + tab.sheetId;
        const block = parseBlock(grid, tab, old, plan.plan_revision, id);
        if (!block) continue;
        if (feedbackBaselines?.size) {
            for (const week of block.weeks) for (const day of week.days) {
                const baseline = feedbackBaselines.get(JSON.stringify([block.id, week.number, day.number]));
                if (baseline && day.sheetFeedback && !splitFeedback(day.sheetFeedback.note).separated)
                    day.note = baseline.planNote;
            }
        }
        if (seen.has(block.id)) throw new PlanConflict("Identidad de bloque duplicada.");
        next.blocks.push(block);
        seen.add(block.id);
    }
    // A connected spreadsheet may initially consist only of a blank or unrelated QA tab.
    if (!next.blocks.length) {
        next.blocks = unavailable().blocks;
    }
    if (metadata.properties?.title) next.properties = { ...routine.properties, title: metadata.properties.title };
    return next;
}

async function readPlan({ supabase, sheets, scan, metadata, plan, feedbackBaselines }) {
    const next = await readBlockRoutine({ sheets, spreadsheetId: scan.spreadsheet_id, metadata, plan, feedbackBaselines });
    // Even an unchanged read acknowledges the baseline and clears a previously repaired conflict.
    const result = await supabase.rpc("apply_block_sheet_plan", {
        p_user_id: scan.user_id, p_plan_id: scan.plan_id, p_lease_token: scan.lease_token,
        p_routine: next, p_expected_revision: plan.plan_revision,
    });
    if (result.error) {
        if (["40001", "22023"].includes(result.error.code))
            throw new PlanConflict("La programación cambió en ambas ubicaciones o retiraría un ejercicio con historial.");
        throw new Error("No se pudo conciliar la programación de Sheets.", { cause: result.error });
    }
    return { ...plan, previousRoutine: plan.routine, routine: next, plan_revision: result.data };
}


export async function importBlockPlan(ctx) {
    try {
        return await readPlan(ctx);
    } catch (error) {
        if (error instanceof PlanConflict) {
            const { scan, supabase } = ctx;
            const result = await supabase.rpc("record_block_sheet_conflict", { p_user_id: scan.user_id, p_plan_id: scan.plan_id,
                p_lease_token: scan.lease_token, p_session_key: "", p_sheet_row: null, p_reason: error.message });
            if (result.error) throw new Error("No se pudo guardar el conflicto de programación.", { cause: result.error });
        }
        throw error;
    }
}
