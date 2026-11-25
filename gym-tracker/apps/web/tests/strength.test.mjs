import assert from "node:assert/strict";
import test from "node:test";
import { movementNames, strengthHistory } from "../src/pages/bloques/strength.ts";
import { newWorkout, sessionKey } from "../src/pages/bloques/routine.ts";

const bench = { id: "bench", name: "Banca", load: "80 kg", prescription: "3x4", effort: "@8" };
const pause = { ...bench, id: "pause", name: "Banca con pausa", load: "110" };
const day = { number: 1, note: "", rating: null, exercises: [bench, pause] };
const week = { number: 1, days: [day] };
const block = { id: "test", name: "Bloque", startDate: "", weeks: [week] };
// A sparse table with reordered rows/headers catches accidental use of row or column indexes as reps/RPE.
const routine = { blocks: [block], rpe: { rows: [[4, .85, .8], [1, .96, .92]], columns: [9, 8] } };
const row = { reps: "4", kg: "84,5", effort: "RIR 2" };

test("separa variantes y carga indicada, admite series históricas y excluye borradores", () => {
    const sets = { bench: [row, { ...row, kg: "86", effort: "", confirmed: true }, { ...row, kg: "200", confirmed: false }],
        pause: [{ ...row, reps: "1", kg: "115", confirmed: true }] };
    const log = { [sessionKey(block, week, day)]: { ...newWorkout(), sets } };
    assert.deepEqual(movementNames(routine), ["Banca", "Banca con pausa"]);
    const [history] = strengthHistory(routine, log, "  BÁNCA ");
    assert.deepEqual(history.planned, { load: 80, estimate: 100 });
    assert.deepEqual(history.recorded, { load: 86, estimate: 84.5 / .8 });
    assert.equal(strengthHistory(routine, log, pause.name)[0].recorded.load, 115);
});

test("conserva la carga y omite la estimación si falta esfuerzo, no hay celda exacta o la serie se mide por tiempo", () => {
    for (const [reps, effort, prescription] of [
        ["8-12", "@8", "3x8-12"], ["4", "", "3x4"], ["11", "@8", "2x11"],
        ["4", "@8.5", "3x4"], ["4", "RIR 2-3", "3x4"], ["4", "@8", '3x30"'],
    ]) {
        const log = { [sessionKey(block, week, day)]: { ...newWorkout(), sets: { bench: [{ reps, effort, kg: "50", confirmed: true }] } } };
        const source = { ...routine, blocks: [{ ...block, weeks: [{ ...week, days: [{ ...day, exercises: [{ ...bench, prescription }] }] }] }] };
        assert.deepEqual(strengthHistory(source, log, bench.name)[0].recorded, { load: 50, estimate: null });
    }
    assert.deepEqual(strengthHistory(routine, {}, bench.name)[0].recorded, { load: null, estimate: null });
});
