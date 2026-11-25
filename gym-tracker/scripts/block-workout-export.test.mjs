import assert from "node:assert/strict";
import test from "node:test";
import { syncOneSheet } from "../supabase/functions/_shared/block-sheet-sync.mjs";
import { sheetExportBatch } from "../supabase/functions/_shared/block-workout-export.mjs";

const job = {
    user_id: "athlete",
    session_key: '["ataque",1,2]',
    spreadsheet_id: "sheet",
    sheet_row: 2,
    lease_token: "token",
    revision: 1,
    exercise_names: { bench: "Banca" },
    workout: {
        startedAt: "2026-11-18T12:00:00Z",
        rating: 3,
        note: "=SUM(1,2)",
        sets: { bench: [{ reps: "5", kg: "82,5", effort: "@8", confirmed: true }] },
    },
};
const plan = {
    properties: { sheetId: 1, title: "Ataque 1", gridProperties: { rowCount: 50, columnCount: 15 } },
};
const empty = () => ({ sheets: [structuredClone(plan)], namedRanges: [], cells: {} });

// Keep only operations the worker sends. Copy first so a failed precondition rolls back all writes.
function apply(state, requests) {
    const next = structuredClone(state);
    for (const request of requests) {
        if (request.addSheet) {
            const { properties } = request.addSheet;
            assert.ok(
                next.sheets.every((s) =>
                    s.properties.title !== properties.title && s.properties.sheetId !== properties.sheetId
                ),
            );
            next.sheets.push({ properties, developerMetadata: [] });
        }
        if (request.createDeveloperMetadata) {
            const m = request.createDeveloperMetadata.developerMetadata;
            next.sheets.find((s) => s.properties.sheetId === m.location.sheetId).developerMetadata.push(m);
        }
        if (request.appendDimension) {
            const a = request.appendDimension;
            const grid = next.sheets.find((s) => s.properties.sheetId === a.sheetId).properties.gridProperties;
            grid[a.dimension === "ROWS" ? "rowCount" : "columnCount"] += a.length;
        }
        if (request.deleteNamedRange) {
            const index = next.namedRanges.findIndex((r) =>
                r.namedRangeId === request.deleteNamedRange.namedRangeId
            );
            assert.notEqual(index, -1);
            next.namedRanges.splice(index, 1);
        }
        if (request.addNamedRange) {
            const { namedRange } = request.addNamedRange;
            assert.ok(
                next.namedRanges.every((r) =>
                    r.name !== namedRange.name && r.namedRangeId !== namedRange.namedRangeId
                ),
            );
            next.namedRanges.push(namedRange);
        }
        if (request.copyPaste) {
            const { source, destination } = request.copyPaste;
            const sourceCells = next.cells[source.sheetId + ":" + source.startRowIndex] ?? [];
            const old = sourceCells.slice(source.startColumnIndex, source.endColumnIndex);
            const destinationCells = next.cells[destination.sheetId + ":" + destination.startRowIndex] ??= [];
            for (let i = 0; i < source.endColumnIndex - source.startColumnIndex; i++) {
                destinationCells[destination.startColumnIndex + i] = old[i];
            }
        }
        if (request.updateCells?.fields === "userEnteredValue") {
            const { rows, range } = request.updateCells;
            const grid = next.sheets.find((s) =>
                s.properties.sheetId === range.sheetId
            ).properties.gridProperties;
            assert.ok(range.endColumnIndex <= grid.columnCount && range.endRowIndex <= grid.rowCount);
            const key = range.sheetId + ":" + range.startRowIndex;
            next.cells[key] ??= [];
            const start = range.startColumnIndex ?? 0;
            for (let i = start; i < range.endColumnIndex; i++) {
                next.cells[key][i] = rows[0].values[i - start]?.userEnteredValue;
            }
        }
    }
    return next;
}

test("exportación legible y literal en una pestaña propia, con copia íntegra y calificación borrable", () => {
    const first = apply(empty(), sheetExportBatch(job, empty()));
    assert.deepEqual(first.sheets[0], plan);
    const key = first.sheets[1].properties.sheetId + ":1";
    assert.equal(first.cells[key][6].stringValue, "Banca: ✓ 5 × 82,5 kg · @8");
    assert.deepEqual(first.cells[key][7], { stringValue: "=SUM(1,2)" });
    assert.deepEqual(JSON.parse(first.cells[key][9].stringValue), job.workout);
    assert.deepEqual(sheetExportBatch(job, first), []);
    const revised = { ...job, revision: 2, workout: { ...job.workout, rating: null, note: "" } };
    const second = apply(first, sheetExportBatch(revised, first));
    assert.equal(second.cells[key][5], undefined);
    assert.equal(second.cells[key][7].stringValue, "");
    assert.equal(second.namedRanges.length, 1);
    assert.deepEqual(sheetExportBatch(job, second), []);
});

test("la escritura vieja queda cercada aunque llegue a Google después de una edición y después de vencer el lease", () => {
    const first = apply(empty(), sheetExportBatch(job, empty()));
    const oldRequest = sheetExportBatch({ ...job, revision: 2 }, first);
    const latest = apply(first, sheetExportBatch({ ...job, revision: 3 }, first));
    assert.throws(() => apply(latest, oldRequest));
    assert.deepEqual(sheetExportBatch({ ...job, revision: 2 }, latest), []);
    const racingFirst = sheetExportBatch({ ...job, session_key: '["ataque",1,3]', sheet_row: 3 }, first);
    const alreadyCreated = apply(first, racingFirst);
    assert.throws(() => apply(alreadyCreated, racingFirst));
});

test("las notas largas tienen una copia completa en fragmentos Unicode; al acortarlas limpia las celdas sobrantes", () => {
    const big = { ...job, workout: { ...job.workout, note: "x" + "💪".repeat(40_000) } };
    const first = apply(empty(), sheetExportBatch(big, empty()));
    const key = first.sheets[1].properties.sheetId + ":1";
    const parts = first.cells[key].slice(9).map((c) => c.stringValue);
    assert.ok(parts.length > 1 && parts.every((p) => p.length <= 32_000 && p.isWellFormed()));
    assert.deepEqual(JSON.parse(parts.join("")), big.workout);
    const next = apply(first, sheetExportBatch({ ...job, revision: 2 }, first));
    assert.ok(next.cells[key].slice(10).every((c) => c === undefined));
});

test("rechaza hojas ajenas, colisiones de nombres y sesiones movidas en la planilla", () => {
    const manual = empty();
    manual.sheets.push({ properties: { sheetId: 9, title: "Registro app" } });
    assert.throws(() => sheetExportBatch(job, manual), /sin la marca/);
    const own = apply(empty(), sheetExportBatch(job, empty()));
    assert.throws(() => sheetExportBatch({ ...job, user_id: "other" }, own), /otra asignación/);
    own.namedRanges[0].range.startRowIndex++;
    assert.throws(() => sheetExportBatch(job, own), /ubicación/);
});

function syncFixture() {
    // The program tab is absent on purpose: importing an empty QA workbook preserves the assigned routine.
    let sheet = apply(
        { sheets: [], namedRanges: [], cells: {} },
        sheetExportBatch(job, { sheets: [], namedRanges: [] }),
    );
    const scan = {
        user_id: job.user_id,
        spreadsheet_id: job.spreadsheet_id,
        plan_id: "plan",
        lease_token: job.lease_token,
    };
    const exercise = { id: "bench", name: "Banca", prescription: "2x5", load: "80", effort: "" };
    const routine = {
        blocks: [{
            id: "ataque",
            name: "Ataque",
            weeks: [{
                number: 1,
                days: [1, 2, 3].map((number) => ({ number, exercises: [exercise], note: "", rating: null })),
            }],
        }],
    };
    const assigned = { ...scan, routine, plan_revision: 1 };
    const workouts = [{ ...structuredClone(job), plan_id: scan.plan_id }];
    let conflicts = [], pending = [], lost = false, failNextWrite = false;
    let beforeWrite;
    const setupCalls = [], errors = [];
    const rpc = async (name, p) => {
        setupCalls.push(name);
        if (name === "apply_block_sheet_plan") {
            if (JSON.stringify(assigned.routine) !== JSON.stringify(p.p_routine)) {
                assigned.plan_revision++;
                assigned.routine = structuredClone(p.p_routine);
            }
            return { data: assigned.plan_revision };
        }
        if (name === "claim_block_sheet_scans") return { data: [scan] };
        if (name === "finish_block_sheet_scan") return { data: true };
        if (name === "record_block_sheet_conflict") {
            conflicts.push({ session_key: p.p_session_key, sheet_row: p.p_sheet_row, reason: p.p_reason });
            return { data: true };
        }
        if (name === "clear_block_sheet_conflict") {
            conflicts = conflicts.filter((c) => c.session_key !== p.p_session_key);
            return { data: true };
        }
        if (name === "apply_block_sheet_workout") {
            const current = workouts.find((w) => w.session_key === p.p_session_key);
            assert.equal(current?.revision ?? 0, p.p_expected_revision);
            const record = {
                ...job,
                session_key: p.p_session_key,
                sheet_row: p.p_sheet_row,
                workout: p.p_workout,
                revision: p.p_expected_revision + 1,
            };
            if (current) Object.assign(current, record);
            else workouts.push(record);
            pending = pending.filter((w) => w.session_key !== record.session_key);
            pending.push(record);
            conflicts = conflicts.filter((c) => c.session_key !== p.p_session_key);
            return { data: { revision: record.revision, sheet_row: record.sheet_row } };
        }
        if (name === "claim_block_workout_exports") {
            assert.equal(p.p_user_id, job.user_id);
            return {
                data: pending.filter((w) => !conflicts.some((c) => c.session_key === w.session_key)).slice(
                    0,
                    1,
                ),
            };
        }
        if (name === "finish_block_workout_export") {
            if (p.p_success) pending = pending.filter((w) => w.session_key !== p.p_session_key);
            else errors.push(p.p_session_key);
            return { data: true };
        }
        throw Error(name);
    };
    const db = {
        rpc,
        from(name) {
            const query = {
                select() {
                    return this;
                },
                eq() {
                    return this;
                },
                order() {
                    return this;
                },
                single() {
                    return { data: structuredClone(assigned) };
                },
                range() {
                    return { data: structuredClone(workouts) };
                },
                then(resolve) {
                    resolve({ data: name === "block_sheet_conflicts" ? structuredClone(conflicts) : workouts });
                },
            };
            return query;
        },
    };
    const managedId = sheet.sheets[0].properties.sheetId;
    const raw = (i, id = managedId) =>
        (sheet.cells[id + ":" + (i - 1)] ?? []).map((c) => c?.stringValue ?? c?.numberValue ?? "");
    const put = (row, column, v, id = managedId) => {
        const cells = sheet.cells[id + ":" + (row - 1)] ??= [];
        cells[column] = { stringValue: v };
    };
    const columnIndex = (text) => [...text].reduce((n, char) => 26 * n + char.charCodeAt(0) - 64, 0) - 1;
    let sheetWrites = 0;
    const sheets = {
        read: async () => structuredClone(sheet),
        readValues: async (_id, ranges) =>
            ranges.map((a) => {
                const m = /^'([^']+)'!([A-Z]+)(\d+)(?::([A-Z]+)(\d*))?$/.exec(a);
                assert.ok(m, a);
                const id = sheet.sheets.find((tab) => tab.properties.title === m[1]).properties.sheetId;
                const from = Number(m[3]), startCol = columnIndex(m[2]), endCol = columnIndex(m[4] ?? m[2]);
                const last = m[4] && !m[5]
                    ? Math.max(
                        from,
                        ...Object.keys(sheet.cells).filter((k) => k.startsWith(id + ":")).map((k) =>
                            Number(k.split(":")[1]) + 1
                        ),
                    )
                    : Number(m[5] || m[3]);
                return {
                    values: Array.from(
                        { length: last - from + 1 },
                        (_, i) => raw(from + i, id).slice(startCol, endCol + 1),
                    ),
                };
            }),
        write: async (_id, requests) => {
            sheetWrites++;
            if (failNextWrite) {
                failNextWrite = false;
                throw Error("429");
            }
            if (beforeWrite && requests.some((r) => r.addNamedRange)) {
                beforeWrite();
                beforeWrite = undefined;
            }
            sheet = apply(sheet, requests);
            if (lost && requests.some((r) => r.addNamedRange)) {
                lost = false;
                throw Error("Google confirmó y se perdió la respuesta");
            }
        },
    };
    return {
        tick: () => syncOneSheet(db, sheets),
        raw,
        put,
        workouts,
        errors,
        setupCalls,
        get sheetWrites() {
            return sheetWrites;
        },
        attachBlock() {
            const id = 1;
            sheet.sheets.push({
                properties: { ...structuredClone(plan.properties), title: "Ataque", sheetId: id },
            });
            const grid = [["", "", "WEEK 1"], ["DÍA 2", "Movimiento", "RPE/RIR", "Series", "Carga"], [
                "",
                "Banca",
                "",
                "2x5",
                "80",
            ], ["", "", "Nota:", "", ""]];
            grid.forEach((row, i) => row.forEach((cell, col) => put(i + 1, col, cell, id)));
            return { setStars: (v) => put(4, 4, v, id), note: () => raw(4, id)[3], stars: () => raw(4, id)[4] };
        },
        get conflicts() {
            return conflicts;
        },
        beforeNextPublish(callback) {
            beforeWrite = callback;
        },
        loseReply: () => {
            lost = true;
        },
        failWrite: () => {
            failNextWrite = true;
        },
        updateApp(change) {
            Object.assign(workouts[0].workout, change);
            workouts[0].revision++;
            pending = [workouts[0]];
        },
    };
}
test("escanea sin outbox, importa edición y alta, publica la base y converge sin otra revisión", async () => {
    const f = syncFixture();
    f.put(2, 7, "Nota en Sheets");
    for (
        const [i, v] of ["Ataque", "1", "3", "2026-11-20", "", "2", "Banca: 8 × 60 kg", "Otra sesión"].entries()
    ) f.put(3, i, v);
    await f.tick();
    assert.equal(f.workouts[0].workout.note, "Nota en Sheets");
    assert.equal(f.workouts[0].revision, 2);
    assert.equal(f.workouts[1].workout.sets.bench[0].kg, "60");
    assert.equal(f.workouts[1].sheet_row, 3);
    assert.equal(JSON.parse(f.raw(2)[9]).note, "Nota en Sheets");
    const count = f.setupCalls.filter((n) => n === "apply_block_sheet_workout").length;
    await f.tick();
    assert.equal(f.setupCalls.filter((n) => n === "apply_block_sheet_workout").length, count);
});
test("una edición incompatible bloquea el export; una elección expresa conserva la versión seleccionada", async () => {
    const f = syncFixture();
    f.updateApp({ rating: 2 });
    f.put(2, 5, "1");
    await f.tick();
    assert.equal(f.conflicts.length, 1);
    assert.equal(f.workouts[0].workout.rating, 2);
    assert.equal(f.raw(2)[5], "1");
    f.put(2, 8, "usar hoja");
    await f.tick();
    assert.equal(f.conflicts.length, 0);
    assert.equal(f.workouts[0].workout.rating, 1);
    assert.equal(f.raw(2)[8], 3);
});
test("respuesta perdida después del commit en Google o rechazo transitorio conserva la entrega", async () => {
    const f = syncFixture();
    f.updateApp({ rating: 2 });
    f.failWrite();
    await assert.rejects(f.tick(), /429/);
    assert.equal(f.raw(2)[5], 3);
    f.loseReply();
    await assert.rejects(f.tick(), /se perdió/);
    assert.equal(f.raw(2)[5], 2);
    await f.tick();
    assert.equal(f.raw(2)[8], 2);
    assert.equal(f.workouts[0].revision, 2);
    assert.equal(f.errors.length, 2);
});

test("recupera un cambio tecleado en la hoja durante la escritura de la app", async () => {
    const f = syncFixture();
    f.updateApp({ rating: 2 });
    f.beforeNextPublish(() => f.put(2, 7, "Nota justo antes del commit"));
    await f.tick();
    assert.equal(f.raw(2)[33], "Nota justo antes del commit");
    await f.tick();
    assert.equal(f.workouts[0].workout.rating, 2);
    assert.equal(f.workouts[0].workout.note, "Nota justo antes del commit");
    assert.equal(f.raw(2)[7], "Nota justo antes del commit");
    assert.equal(f.workouts[0].revision, 3);
});

test("H2 y E4 de pestañas distintas convergen en una sola sesión y el siguiente ciclo no escribe", async () => {
    const f = syncFixture(), block = f.attachBlock();
    f.updateApp({ note: "Banca: Con pausa", exerciseNotes: { bench: "Con pausa" } });
    await f.tick();
    assert.equal(block.note(), "Banca: Con pausa");
    assert.equal(block.stars(), "★★★");
    for (
        const [input, expected, detail] of [
            [
                "Banca: Nota editada desde Sheets",
                "Banca: Nota editada desde Sheets",
                "Nota editada desde Sheets",
            ],
            ["Nota general", "Nota general\nBanca: Nota editada desde Sheets", "Nota editada desde Sheets"],
        ]
    ) {
        f.put(2, 7, input);
        block.setStars("★★☆");
        await f.tick();
        const w = f.workouts[0];
        assert.deepEqual(f.conflicts, []);
        assert.equal(w.workout.note, expected);
        assert.equal(w.workout.exerciseNotes.bench, detail);
        assert.equal(w.workout.rating, 2);
        assert.equal(block.note(), expected);
        assert.equal(f.raw(2)[7], expected);
        assert.equal(JSON.parse(f.raw(2)[9]).note, expected);
        const before = [w.revision, f.sheetWrites];
        await f.tick();
        assert.deepEqual(f.conflicts, []);
        assert.deepEqual([w.revision, f.sheetWrites], before);
    }
});
