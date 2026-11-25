import assert from "node:assert/strict";
import test from "node:test";
import {
    findDay,
    normalizeCell,
    reconcileRow,
    SheetConflict,
} from "../supabase/functions/_shared/block-sheet-row.mjs";
import { valuesFor } from "../supabase/functions/_shared/block-workout-export.mjs";

const day = { number: 1, exercises: [{ id: "s", name: "Sentadilla", prescription: "2x5" }] };
const routine = { blocks: [{ id: "a", name: "Ataque", weeks: [{ number: 1, days: [day] }] }] };
const { key, names } = findDay(routine, ["ATAQUE", 1, 1]);
const base = {
    startedAt: "2026-11-18T12:00:00.000Z",
    sets: { s: [{ reps: "5", kg: "80", effort: "", confirmed: true }] },
    rating: 1,
    note: "Sentadilla: con pausa",
    exerciseNotes: { s: "con pausa" },
};
const raw = () => valuesFor({ session_key: key, workout: base, exercise_names: names, revision: 2 });
const merge = (overrides = {}) =>
    reconcileRow({
        key,
        day,
        names,
        dbRow: { workout: base, revision: 2 },
        base,
        raw: raw(),
        zone: "America/Argentina/Mendoza",
        ...overrides,
    });

test("importa cambios manuales conservando notas por ejercicio y edición independiente del otro dispositivo", () => {
    const cells = raw();
    cells[6] = "Sentadilla: ✓ 5 × 85 kg / ○ 5 × 85 kg";
    cells[7] = "Trabajo técnico";
    const next = merge({ raw: cells, dbRow: { workout: { ...base, rating: 3 } } });
    assert.equal(next.rating, 3);
    assert.equal(next.sets.s[0].kg, "85");
    assert.equal(next.sets.s[1].confirmed, false);
    assert.equal(next.legacyNote, "Trabajo técnico");
    assert.equal(next.note, "Trabajo técnico\nSentadilla: con pausa");
    assert.deepEqual(next.exerciseNotes, base.exerciseNotes);
});
test("retiene un conflicto al cambiar la misma columna y permite elegir la versión a conservar", () => {
    const cells = raw();
    cells[5] = 3;
    const opts = { raw: cells, dbRow: { workout: { ...base, rating: 2 } } };
    assert.throws(() => merge(opts), SheetConflict);
    cells[8] = "usar hoja";
    assert.equal(merge(opts).rating, 3);
    cells[8] = "usar app";
    assert.equal(merge(opts).rating, 2);
});
test("detecta edición física justo durante batch y colisión con feedback editable original", () => {
    const expected = raw().slice(0, 8);
    const captured = [...expected];
    captured[5] = 2;
    assert.equal(merge({ expected, captured }).rating, 2);
    assert.throws(() => merge({ expected, captured, original: { patch: { rating: 3 } } }), /planificación/);
    assert.deepEqual(merge(), base);
});
test("alta desde una fila legible, por nombre o ID de bloque, con fecha nativa y series por nombre", () => {
    const cells = ["Ataque", 1, 1, 46344.5, "", 3, "Sentadilla: 6 × 72,5 kg", "bien"];
    const next = merge({ raw: cells, base: null, dbRow: null, now: "2026-11-23T10:00:00Z" });
    assert.equal(next.sets.s[0].kg, "72,5");
    assert.equal(next.rating, 3);
    assert.ok(next.startedAt.endsWith("T15:00:00.000Z"));
    assert.equal(normalizeCell(3, "18/11/2026 09:00", "America/Argentina/Mendoza"), base.startedAt);
    assert.throws(
        () => merge({ raw: [...cells.slice(0, 5), "excelente", ...cells.slice(6)], dbRow: null, base: null }),
        /estrellas/,
    );
});

test("dos variantes con el mismo nombre conservan las series de cada ejercicio", () => {
    const exercises = [...day.exercises, { ...day.exercises[0], id: "t" }];
    const order = { s: "Sentadilla", t: "Sentadilla" };
    const current = { ...base, sets: { t: [{ reps: "8", kg: "50", effort: "" }] } };
    const cells = valuesFor({ session_key: key, workout: current, exercise_names: order, revision: 1 });
    assert.match(cells[6], /Sentadilla \(2\)/);
    cells[6] = "Sentadilla (2): ✓ 8 × 60 kg";
    const next = merge({
        base: current,
        dbRow: { workout: current },
        raw: cells,
        day: { ...day, exercises },
        names: order,
    });
    assert.equal(next.sets.t[0].kg, "60");
    assert.equal(next.sets.s, undefined);
    cells[6] = "Sentadilla: ✓ 8 × 50 kg";
    assert.deepEqual(
        merge({
            base: current,
            dbRow: { workout: current },
            raw: cells,
            day: { ...day, exercises },
            names: order,
        }),
        current,
    );
});

test("H cambia la nota por ejercicio o la general junto con E del bloque, y se publica sin otra escritura", () => {
    for (const human of ["Sentadilla: Nota editada desde Sheets", "Nota general desde Sheets"]) {
        const cells = raw();
        cells[7] = human;
        const imported = merge({ raw: cells, original: { patch: { rating: 2 } } });
        assert.equal(imported.rating, 2);
        const qualified = human.startsWith("Sentadilla:");
        assert.equal(imported.exerciseNotes.s, qualified ? "Nota editada desde Sheets" : "con pausa");
        assert.equal(imported.note, qualified ? human : human + "\nSentadilla: con pausa");
        const current = { workout: imported, revision: 3 };
        // The same H/E are still visible while the export ACK is pending.
        assert.deepEqual(merge({ raw: cells, dbRow: current, original: { patch: { rating: 2 } } }), imported);
        const published = valuesFor({
            session_key: key,
            workout: imported,
            exercise_names: names,
            revision: 3,
        });
        assert.deepEqual(merge({ base: imported, raw: published, dbRow: current }), imported);
    }
});
test("repara la duplicación exacta creada por el importador anterior sin tapar una edición genuina", () => {
    const human = "Sentadilla: Nota editada desde Sheets", cells = raw();
    cells[7] = human;
    const contaminated = { ...base, legacyNote: human, note: human + "\n" + base.note, rating: 2 };
    const repaired = merge({ raw: cells, dbRow: { workout: contaminated } });
    assert.equal(repaired.note, human);
    assert.equal(repaired.exerciseNotes.s, "Nota editada desde Sheets");
    assert.equal(repaired.rating, 2);
    assert.throws(
        () =>
            merge({
                raw: cells,
                dbRow: {
                    workout: {
                        ...base,
                        note: "Sentadilla: texto distinto",
                        exerciseNotes: { s: "texto distinto" },
                    },
                },
            }),
        SheetConflict,
    );
});

test("una fecha escrita con un día imposible o minutos fuera de rango no mueve el entrenamiento", () => {
    for (const value of ["29/02/2025", "18/11/2026 08:65", "2026-02-30T10:00:00Z", "2026-04-31T23:30:00-03:00"]) {
        assert.throws(() => normalizeCell(3, value, "America/Argentina/Mendoza"), SheetConflict, value);
    }
    assert.equal(normalizeCell(3, "2024-02-29T23:59:00-03:00", "UTC"), "2024-03-01T02:59:00.000Z");
    assert.equal(normalizeCell(3, "29/02/2024 23:59", "America/Argentina/Mendoza"), "2024-03-01T02:59:00.000Z");
});

test("una carga con unidad y un borrador parcial conviven con una edición de otra serie en Sheets", () => {
    const sets = [{ ...base.sets.s[0], kg: "72,5 kg" }, { reps: "6", kg: "80,", effort: "", confirmed: false }, { ...base.sets.s[0] }];
    const current = { ...base, sets: { s: sets } };
    const cells = valuesFor({ session_key: key, workout: current, exercise_names: names, revision: 4 });
    assert.match(cells[6], /72,5 kg \//);
    cells[6] = cells[6].replace("5 × 80 kg", "5 × ,5 kg");
    const next = merge({ base: current, dbRow: { workout: current }, raw: cells });
    assert.deepEqual(next.sets.s.slice(0, 2), sets.slice(0, 2));
    assert.equal(next.sets.s[2].kg, ",5");
    const old = [...cells]; old[6] = "Sentadilla: ✓ 5 × 72,5 kg kg / ○ 6 × 80, kg / ✓ 5 × 80 kg";
    assert.deepEqual(merge({ base: current, dbRow: { workout: current }, raw: old }), current);
});

test("las series marcadas desde la hoja usan las mismas reglas que la app y conservan el esfuerzo libre", () => {
    const cells = raw();
    for (const entry of ["cinco", "5,", "-1", "0", "3,4", "10 × 9007199254740993 kg"]) {
        cells[6] = "Sentadilla: ✓ " + entry;
        assert.throws(() => merge({ raw: cells }), SheetConflict, entry);
    }
    cells[6] = "Sentadilla: ✓ 6–8 × ,5 kg · RPE: 8";
    const set = merge({ raw: cells }).sets.s[0];
    assert.deepEqual(set, { reps: "6–8", kg: ",5", effort: "RPE: 8", confirmed: true });
    for (const value of [true, "1e0", "0x2"]) assert.throws(() => normalizeCell(5, value), SheetConflict);
});

test("un fin anterior al inicio se puede corregir sin cambiar la fecha guardada", () => {
    const cells = raw();
    cells[4] = "2026-11-18T11:59:00Z";
    assert.throws(() => merge({ raw: cells }), /posterior al inicio/);
    cells[4] = "2026-11-18T09:00:00-03:00";
    assert.equal(merge({ raw: cells }).finishedAt, base.startedAt);
});

test("la unidad pegada sin espacio y un nombre con dos puntos vuelven sin alterar el borrador", () => {
    const named = { ...day.exercises[0], name: "Banca: pausa" };
    const other = { ...named, name: "Banca", id: "b" };
    const exercises = [other, named];
    const labels = { b: other.name, s: named.name };
    const current = { ...base, sets: { s: [{ ...base.sets.s[0], kg: "75KG" }] } };
    const cells = valuesFor({ session_key: key, workout: current, exercise_names: labels, revision: 2 });
    assert.equal(cells[6], "Banca: pausa: ✓ 5 × 75 kg");
    cells[6] += " / ✓ 3 × 70 kg · RPE: 7";
    const next = merge({ day: { ...day, exercises }, base: current, dbRow: { workout: current }, raw: cells, names: labels });
    assert.equal(next.sets.s[0].kg, "75KG");
    assert.equal(next.sets.s[1].effort, "RPE: 7");
    assert.equal(next.sets.b, undefined);
});
