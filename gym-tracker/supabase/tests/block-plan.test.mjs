import assert from "node:assert/strict";
import test from "node:test";
import { feedbackDivider, importBlockPlan, parseBlock, readBlockRoutine } from "../functions/_shared/block-plan-import.mjs";
import { readOriginalFeedback, writeOriginalFeedback } from "../functions/_shared/block-original-feedback.mjs";
import { changeNote } from "../functions/_shared/block-sheet-row.mjs";

const tab = { sheetId: 23, title: "qa", gridProperties: { rowCount: 32, columnCount: 9 } };
const grid = [
    ["fecha", "", "WEEK 1", "", "", "", "WEEK 2"],
    ["DÍA 1", "Movimiento", "RPE/RIR", "Series", "Carga", "", "RPE/RIR", "Series", "Carga"],
    ["", "Sentadilla", "", "", "", "", "@7", "3x5", "90"],
    ["", "Sentadilla", "", "", "", "", "@8", "2x6", "65"],
    ["", "Remo", "", "", "", "", "", "3x10", "20"],
    ["", "Fila sin programación"],
    ["", "", "Nota:", "", "", "", "Nota:", "Nota del plan", "★★☆"],
];
const make = (rows = grid, prev, revision = 1) => parseBlock(rows, tab, prev, revision);
const dayOf = b => b.weeks[0].days[0];

test("identifica las semanas por encabezado y reutiliza ejercicios al mover o insertar filas", () => {
    const first = make();
    assert.deepEqual(first.weeks.map(w => w.number), [2]);
    assert.deepEqual(dayOf(first).exercises.map(e => e.id), ["qa-1-3", "qa-1-4", "qa-1-5"]);
    dayOf(first).exercises[0].id = "squat-1";
    const second = make([grid[0], grid[1], grid[3], ["", "Vuelo", "", "", "", "", "@5", "3x6", "10"], grid[4], grid[2], grid[5], grid[6]], first);
    const ex = dayOf(second).exercises;
    assert.equal(ex[3].id, "squat-1");
    assert.equal(ex[0].id, "qa-1-4");
    assert.equal(ex[2].id, "qa-1-5");
    assert.ok(!["squat-1", "qa-1-4", "qa-1-5"].includes(ex[1].id));
    assert.equal(dayOf(second).sheetFeedback.rowIndex, 7);
    assert.equal(dayOf(second).sheetFeedback.noteColumnIndex, 7);
    assert.equal(dayOf(second).sheetFeedback.ratingColumnIndex, 8);
    const renamed = parseBlock(grid, { ...tab, title: "Nuevo título" }, first, 2);
    assert.equal(renamed.id, "qa");
    assert.equal(renamed.name, "Nuevo título");
    assert.equal(dayOf(renamed).exercises[0].id, "squat-1");
});

test("un duplicado editado y reordenado que ya no se puede identificar queda en conflicto", async () => {
    const prior = make();
    const modified = structuredClone(grid);
    modified[2][7] = "6x2";
    modified[3][7] = "3x8";
    assert.throws(() => make(modified, prior), /ejercicio repetido/);
    const calls = [];
    await assert.rejects(importBlockPlan({
        supabase: { rpc: async (method, args) => { calls.push([method,args]); return {}; } },
        sheets: { readValues: async () => [{ values: modified }] }, scan: {},
        metadata: { sheets: [{ properties: tab }] }, plan: { routine: { blocks: [prior] }, plan_revision: 2 },
    }), /ejercicio repetido/);
    assert.equal(calls[0][0], "record_block_sheet_conflict");
    assert.equal(calls[0][1].p_session_key, "");
});

function fixture({ raw = "Nota del plan", rating = "★★☆", note = "", stars = 2, baseOriginal = null, base = null, formula } = {}) {
    const cells = structuredClone(grid);
    cells[6][7] = raw;
    cells[6][8] = rating;
    const block = make(cells);
    const current = { note, rating: stars, sets: {}, startedAt: "2026-11-01T00:00:00Z" };
    return { plan: { routine: { blocks: [block] } }, scan: { spreadsheet_id: "fixture" },
        sheets: { readValues: async (_, ranges, render) => render === "FORMULA"
            ? [{ values: [["Nota:", formula ?? raw, rating]] }]
            : ranges.map(r => ({ values: r.endsWith("!G1") ? [["WEEK 2"]] : r.endsWith("!A2") ? [["DÍA 1"]] : [["Nota:", raw, rating]] })) },
        dbRow: { session_key: '["qa",2,1]', workout: current }, base, baseOriginal };
}

test("publica nota general y estrellas conservando la nota de planificación y el formato", async () => {
    const ctx = fixture({ note: "Sentadilla: pausa", stars: 3 });
    ctx.original = await readOriginalFeedback(ctx);
    assert.deepEqual(ctx.original.patch, {});
    const { requests, baseline } = await writeOriginalFeedback(ctx);
    assert.ok(baseline.note.startsWith("Nota del plan"));
    assert.ok(baseline.note.includes(feedbackDivider));
    assert.ok(baseline.note.endsWith("Sentadilla: pausa"));
    assert.equal(baseline.rating, 3);
    assert.deepEqual(requests.map(r => [r.updateCells.range.startColumnIndex, r.updateCells.fields]), [[7, "userEnteredValue"], [8, "userEnteredValue"]]);
    assert.equal(requests[1].updateCells.rows[0].values[0].userEnteredValue.stringValue, "★★★");
    const rerun = fixture({ raw: baseline.note, rating: "★★★", note: "Sentadilla: pausa", stars: 3,
        base: { note: "Sentadilla: pausa", rating: 3 }, baseOriginal: baseline });
    rerun.original = await readOriginalFeedback(rerun);
    assert.deepEqual(rerun.original.patch, {});
    assert.equal(rerun.original.needsBaseline, false);
    assert.deepEqual((await writeOriginalFeedback(rerun)).requests, []);
});

test("ediciones desde la hoja convergen incluso si hay notas por ejercicio; avisa al editar lo mismo", async () => {
    const previous = { note: "Sentadilla: pausa", rating: 2 };
    const baseline = { note: "Sentadilla: pausa", planNote: "", rating: 2, truncated: false };
    const ctx = fixture({ raw: "Registro nuevo", rating: "★☆☆", note: previous.note, base: previous, baseOriginal: baseline });
    ctx.dbRow.workout.exerciseNotes = { "qa-1-3": "pausa" };
    const original = await readOriginalFeedback(ctx);
    assert.deepEqual(original.patch, { rating: 1, note: "Registro nuevo" });
    assert.equal(original.conflict, undefined);
    changeNote(ctx.dbRow.workout, original.patch.note, dayOf(ctx.plan.routine.blocks[0]));
    ctx.dbRow.workout.rating = 1;
    ctx.original = await readOriginalFeedback(ctx);
    assert.deepEqual(ctx.original.patch, {});
    const sent = await writeOriginalFeedback(ctx);
    assert.equal(sent.baseline.note, "Registro nuevo\nSentadilla: pausa");
    const collision = fixture({ raw: "Nota hoja", note: "Nota dispositivo", base: previous, baseOriginal: baseline });
    assert.match((await readOriginalFeedback(collision)).conflict, /misma nota/);
});

test("preserva fórmulas y detecta filas desplazadas antes del batch; la nota larga se abrevia sólo en la pestaña del bloque", async () => {
    const formula = fixture({ note: "Cambió la nota", formula: "=TEXT(A1)" });
    await assert.rejects(readOriginalFeedback(formula), /fórmula/);
    const moved = fixture({ note: "=literal" });
    moved.original = await readOriginalFeedback(moved);
    moved.sheets.readValues = async () => [{ values: [["WEEK 4"]] }, { values: [["DÍA 1"]] }, { values: [["Nota:"]] }];
    await assert.rejects(writeOriginalFeedback(moved), /Cambió la fila/);
    const long = fixture({ note: "🏋".repeat(30_000) });
    long.original = await readOriginalFeedback(long);
    const out = await writeOriginalFeedback(long);
    assert.ok(out.baseline.note.length <= 50_000);
    assert.ok(out.baseline.truncated);
    assert.equal(long.dbRow.workout.note.length, 60_000);
});

test("una nota plana de entrenamiento no cambia la instrucción del plan ni crea una sesión", async () => {
    const raw = structuredClone(grid);
    raw[6][7] = "Sentadilla: pausada";
    const read = { metadata: { sheets: [{ properties: tab }] }, sheets: { readValues: async () => [{ values: raw }] },
        plan: { routine: { blocks: [make()] }, plan_revision: 2 }, spreadsheetId: "test" };
    const original = dayOf((await readBlockRoutine(read)).blocks[0]);
    assert.equal(original.note, "Sentadilla: pausada");
    assert.equal(original.rating, 2);
    const baseline = new Map([['["qa",2,1]', { planNote: "" }]]);
    const after = dayOf((await readBlockRoutine({ ...read, feedbackBaselines: baseline })).blocks[0]);
    assert.equal(after.note, "");
    assert.equal(after.sheetFeedback.note, "Sentadilla: pausada");
    assert.equal(after.rating, 2);
    await assert.rejects(readBlockRoutine({ ...read, metadata: { sheets: [] } }), /bloques vinculados/);
});

test("conserva la edición manual que llega entre la relectura y el batch de Google", async () => {
    const ctx = fixture({ note: "Nota app", stars: 3 });
    ctx.tab = { properties: { sheetId: 99 } };
    ctx.number = 2;
    ctx.original = await readOriginalFeedback(ctx);
    const published = await writeOriginalFeedback(ctx);
    assert.deepEqual(published.baseline.guard, { note: "Nota del plan", rating: 2 });
    assert.equal(published.shadowColumnCount, 125);
    assert.equal(published.requests.filter(r => r.copyPaste).length, 2);
    assert.ok(published.requests.at(-1).updateCells);
    const next = fixture({ raw: published.baseline.note, rating: "★★★", note: "Nota app", stars: 3,
        base: ctx.dbRow.workout, baseOriginal: published.baseline });
    next.raw = [];
    next.raw[123] = "Última nota desde el teléfono";
    next.raw[124] = "★☆☆";
    const recovered = await readOriginalFeedback(next);
    assert.match(recovered.conflict, /mientras se publicaba/);
    assert.deepEqual(recovered.patch, { note: "Última nota desde el teléfono", rating: 1 });
});
