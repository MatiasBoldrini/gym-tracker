import assert from "node:assert/strict";
import { reconcileWorkout } from "../src/pages/bloques/reconcileWorkout.ts";
import { receiveWorkout } from "../src/pages/bloques/cloudWorkoutStorage.ts";
import test from "node:test";
import { setInputState, prescriptionInputState } from "../src/lib/setInput.ts";
import { editableSet, emptySet, exerciseProgress, hasExerciseRecord, isTimed, newWorkout, parseRoutine, setsForCompletion, updateExercise, validSetValues } from "../src/pages/bloques/routine.ts";

const lift = { id: "squat", name: "Squat", prescription: "3 × 4", load: "92,5 kg", effort: "@7" };
const other = { ...lift, id: "back-off" };
const day = { number: 1, exercises: [lift, other], note: "", rating: null };
const manual = { reps: "6", kg: "85", effort: "@8" };

test("completar y deshacer conserva los registros manuales y las series extra", () => {
    const partial = { reps: "5", kg: "", effort: "" };
    const checked = setsForCompletion(lift, [partial, manual], true);
    assert.deepEqual(checked.map(({ reps, kg, effort }) => [reps, kg, effort]), [
        ["5", "92,5", ""], ["6", "85", "@8"], ["4", "92,5", ""],
    ]);
    assert.deepEqual(setsForCompletion(lift, checked, true), checked);
    assert.deepEqual(setsForCompletion(lift, [...checked, manual], false), [partial, manual, emptySet(), manual]);
    assert.deepEqual(setsForCompletion(lift, [], false), []);
});

test("registra la indicación literal para rangos, tiempo y repeticiones por lado", () => {
    for (const target of ["8-12", '30"', "30 s", "6c/u"]) {
        const exercise = { ...lift, prescription: "3x" + target, load: "" };
        assert.deepEqual(editableSet(exercise), { reps: target, kg: "", effort: "" });
        const sets = setsForCompletion(exercise, [], true);
        assert.equal(sets.length, 3);
        assert.ok(sets.every(s => s.reps === target && s.kg === "" && s.effort === ""));
        assert.equal(isTimed(exercise), target.startsWith("30"));
    }
    assert.deepEqual(setsForCompletion({ ...lift, prescription: "" }, [], true), []);
});

test("valida lo que se confirma sin descartar borradores, rangos ni las indicaciones del plan", () => {
    const original = newWorkout();
    for (const reps of ["-4", "0", "3,5", "texto", "Las Heras, Mendoza", "-,,,,,7"]) {
        assert.equal(updateExercise(original, day, lift, { index: 0, field: "reps", value: reps }), original);
        const legacy = { ...original, sets: { [lift.id]: [{ ...manual, reps, confirmed: false }] } };
        assert.equal(updateExercise(legacy, day, lift, { index: 0, confirmed: true }), legacy);
        const corrected = updateExercise(legacy, day, lift, { index: 0, field: "reps", value: "7" });
        assert.deepEqual(corrected.sets[lift.id][0], { ...manual, reps: "7", confirmed: false });
    }
    const timed = { ...lift, prescription: '2x30"' };
    assert.ok(validSetValues({ ...manual, reps: "0:45" }, timed));
    assert.ok(validSetValues({ ...manual, reps: "0,5" }, timed));
    assert.ok(validSetValues({ ...manual, reps: "al fallo" }, { ...lift, prescription: "2xal fallo" }));
    assert.equal(validSetValues({ ...manual, reps: "0:00" }, timed), false);
    assert.equal(validSetValues({ ...manual, kg: "9".repeat(320) }, lift), false);
    const confirmed = updateExercise(newWorkout(), day, lift, { index: 0, confirmed: true });
    const corrected = updateExercise(confirmed, day, lift, { index: 0, field: "kg", value: "-2" });
    assert.equal(corrected, confirmed);
});

test("una lectura distingue una respuesta perdida de otra edición aunque PostgreSQL reordene las claves", () => {
    const workout = { ...newWorkout(2), note: "Primera", sets: { a: [manual] } };
    const local = { scope: "A", key: "día", revision: 1, pending: true, workout,
        sending: { id: "envío", revision: 1, workout } };
    const remote = { revision: 2, workout: { ...workout, sets: { a: [{ effort: manual.effort, kg: manual.kg, reps: manual.reps }] } } };
    assert.equal(receiveWorkout("A", "día", remote, local).pending, false);
    const newer = { ...local, workout: { ...workout, note: "Segunda" } };
    const ack = receiveWorkout("A", "día", remote, newer);
    assert.equal(ack.pending, true);
    assert.equal(ack.revision, 2);
    assert.equal(ack.workout.note, "Segunda");
    assert.equal(ack.sending, undefined);
    const other = { revision: 3, workout: { ...workout, note: "Otro dispositivo" } };
    const conflict = receiveWorkout("A", "día", other, ack);
    assert.deepEqual(conflict.conflict, other);
    assert.equal(conflict.workout.note, "Segunda");
    assert.equal(receiveWorkout("A", "día", remote, conflict), conflict);
});

test("una nota sin series protege la fila y el resumen conserva el orden y la nota anterior", () => {
    const initial = { ...newWorkout(), note: "Sesión anterior", rating: 2 };
    let workout = updateExercise(initial, day, other, { note: "Otra carga" });
    assert.ok(hasExerciseRecord(workout, other.id));
    assert.deepEqual(workout.sets, {});
    workout = updateExercise(workout, day, lift, { note: "Con pausa" });
    workout = updateExercise(workout, day, lift, { checked: true });
    assert.equal(workout.note, "Sesión anterior\nSquat: Con pausa\nSquat: Otra carga");
    workout = updateExercise(workout, day, lift, { checked: false });
    assert.equal(workout.exerciseNotes[lift.id], "Con pausa");
    workout = updateExercise(workout, day, lift, { note: "" });
    workout = updateExercise(workout, day, other, { note: "" });
    assert.equal(workout.note, "Sesión anterior");
    assert.equal(workout.rating, 2);
    assert.ok(!hasExerciseRecord(workout, lift.id));
});

test("precarga la indicación y conserva los cambios hasta confirmar cada serie", () => {
    let workout = newWorkout();
    function edit(index, field, value) {
        workout = updateExercise(workout, day, lift, { index, field, value });
    }
    assert.deepEqual(editableSet(lift), { reps: "4", kg: "92,5", effort: "" });
    assert.deepEqual(workout.sets, {});
    edit(2, "kg", "72,");
    assert.deepEqual(workout.sets[lift.id], [emptySet(), emptySet(), { reps: "4", kg: "72,", effort: "", confirmed: false }]);
    edit(2, "reps", "5");
    assert.equal(exerciseProgress(workout, lift).count, 0);
    edit(2, "kg", "72,5");
    assert.equal(exerciseProgress(workout, lift).count, 0);
    workout = updateExercise(workout, day, lift, { index: 2, confirmed: true });
    assert.equal(exerciseProgress(workout, lift).count, 1);
    const original = workout.sets[lift.id];
    workout = updateExercise(workout, day, lift, { checked: true });
    assert.deepEqual(exerciseProgress(workout, lift), { count: 3, target: 3, checked: true });
    workout = updateExercise(workout, day, lift, { checked: false });
    assert.deepEqual(workout.sets[lift.id], original);
    workout = updateExercise(workout, day, lift, { index: 2, confirmed: false });
    assert.equal(exerciseProgress(workout, lift).count, 0);
    assert.equal(workout.sets[lift.id][2].kg, "72,5");
    edit(2, "kg", "");
    edit(2, "reps", "");
    assert.deepEqual(editableSet(lift, workout.sets[lift.id][2]), emptySet());
    assert.deepEqual(editableSet(lift, workout.sets[lift.id][1]), editableSet(lift));
});

test("la confirmación y la carga se pueden recuperar en cualquier orden", () => {
    const initial = newWorkout();
    const mark = { index: 1, confirmed: true };
    const load = { index: 1, field: "kg", value: "80" };
    const replay = edits => edits.reduce((w, edit) => updateExercise(w, day, lift, edit), initial);
    const workout = replay([mark, load]);
    assert.deepEqual(workout, replay([load, mark, mark]));
    assert.equal(exerciseProgress(workout, lift).count, 1);
    assert.deepEqual(workout.sets[lift.id][1], { reps: "4", kg: "80", effort: "", confirmed: true });
});

test("tildar todas las series finaliza la sesión y deshacer respeta el último marcado conjunto", () => {
    const oneExercise = { ...day, exercises: [lift] };
    let workout = newWorkout();
    const apply = change => { workout = updateExercise(workout, oneExercise, lift, change); };
    for (const index of [2, 0, 1]) apply({ index, confirmed: true });
    assert.ok(workout.finishedAt);
    apply({ checked: false });
    assert.equal(workout.finishedAt, undefined);
    assert.equal(exerciseProgress(workout, lift).count, 0);
    apply({ checked: true });
    apply({ index: 1, confirmed: false });
    apply({ checked: true });
    apply({ checked: false });
    assert.deepEqual(workout.sets[lift.id].map(s => s.confirmed), [true, false, true]);
    apply({ checked: false });
    assert.equal(exerciseProgress(workout, lift).count, 2);
});

test("la sesión se completa automáticamente y se puede corregir después", () => {
    let workout = updateExercise(newWorkout(), day, lift, { checked: true });
    assert.equal(workout.finishedAt, undefined);
    workout = updateExercise(workout, day, other, { checked: true });
    assert.ok(workout.finishedAt);
    const date = workout.finishedAt;
    workout = updateExercise(workout, day, other, { index: 1, field: "kg", value: "45" });
    workout = updateExercise(workout, day, lift, { note: "Tempo " });
    assert.equal(workout.finishedAt, date);
    assert.equal(workout.exerciseNotes[lift.id], "Tempo ");
    assert.equal(workout.note, "Squat: Tempo");
    workout = updateExercise(workout, day, other, { checked: false });
    assert.equal(workout.finishedAt, undefined);
    assert.equal(workout.sets[other.id][1].kg, "45");
    assert.deepEqual(exerciseProgress(workout, other), { count: 1, target: 3, checked: false });
});

test("las filas históricas adicionales no completan las series pendientes del plan", () => {
    const old = { ...newWorkout(), sets: { [lift.id]: [emptySet(), manual, emptySet(), manual] } };
    const updated = updateExercise(old, day, lift, { index: 0, field: "kg", value: "80" });
    assert.deepEqual(updated.sets[lift.id][3], manual);
    assert.equal(exerciseProgress(updated, lift).count, 1);
});

test("la importación conserva los metadatos de Sheets y admite copias anteriores sin título", () => {
    const data = { blocks: [{ id: "base", name: "Base", startDate: "", weeks: [{ number: 1, days: [day] }] }],
        activation: [], catalog: [], rpe: { columns: [], rows: [] } };
    assert.deepEqual(parseRoutine(data), data);
    const imported = parseRoutine({ ...data, spreadsheetId: "sheet-123", properties: { title: " Fuerza ", locale: "es_AR" } });
    assert.equal(imported.spreadsheetId, "sheet-123");
    assert.equal(imported.properties.title, "Fuerza");
});

test("formatos de teclado y de planilla alrededor de cada entero", () => {
    const timed = { ...lift, prescription: '3x30"' };
    for (let n = 1; n <= 96; n++) {
        for (const reps of [String(n), ` ${n} `, `${n} c/u`, `${n}–${n + 1}`]) {
            assert.ok(validSetValues({ ...manual, reps }, lift), reps);
        }
        for (const reps of [`${n},`, `${n}.`, `-${n}`, `${n},2`, `${n}:${60 + n}`, `${n}e2`]) {
            assert.equal(validSetValues({ ...manual, reps }, lift), false, reps);
        }
        for (const reps of [`${n}:09`, `${n},5 s`, `${n} min`]) {
            assert.ok(validSetValues({ ...manual, reps }, timed), reps);
        }
        for (const kg of [`${n},25`, `${n}.25 kg`, `\u00a0${n},25\u00a0kg `, `,${n}`]) {
            assert.ok(validSetValues({ ...manual, kg }, lift), kg);
        }
        for (const kg of [`${n},`, `${n}..2`, `${n} lb`, `${n}\t25`, `-${n}`]) {
            assert.equal(validSetValues({ ...manual, kg }, lift), false, kg);
        }
    }
    for (const kg of ["9007199254740993", "9".repeat(308)]) {
        assert.equal(validSetValues({ ...manual, kg }, lift), false);
    }
});

test("secuencias reproducibles de escritura, borrado, confirmación y reapertura", () => {
    for (let seed = 1; seed <= 128; seed++) {
        let state = seed;
        function next(n) {
            state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
            return (state >>> 8) % n;
        }
        let workout = newWorkout(null);
        let reps = "4", kg = "92,5", note = "", checked = false;
        const valid = () => ["4", "7", "6-8"].includes(reps) && ["92,5", "75.5", ",5", ""].includes(kg);
        for (let i = 0; i < 40; i++) {
            const action = next(6);
            let edit;
            if (action === 0) {
                const value = ["4", "7", "6-8", "7,", "", "-2"][next(6)];
                edit = { index: 0, field: "reps", value };
                if (["4", "7", "6-8", ""].includes(value)) reps = value;
                checked &&= valid();
            } else if (action === 1) {
                const value = ["92,5", "75.5", ",5", "", "7..5", "kg"][next(6)];
                edit = { index: 0, field: "kg", value };
                if (["92,5", "75.5", ",5", ""].includes(value)) kg = value;
                checked &&= valid();
            } else if (action === 2 || action === 3) {
                const confirm = action === 2;
                edit = { index: 0, confirmed: confirm };
                if (!confirm || valid()) checked = confirm;
            } else if (action === 4) {
                note = ["", "Última\nserie 💪", "右肩", "  pausa  "][next(4)];
                edit = { note };
            } else {
                workout = JSON.parse(JSON.stringify(workout));
            }
            if (edit) workout = updateExercise(workout, day, lift, edit);
            const actual = editableSet(lift, workout.sets[lift.id]?.[0]);
            assert.deepEqual([actual.reps, actual.kg, workout.exerciseNotes?.[lift.id] ?? "", exerciseProgress(workout, lift).count],
                [reps, kg, note, Number(checked)], `semilla ${seed}, paso ${i}`);
        }
    }
});

test("combina celdas distintas de la misma serie y las notas de ejercicios distintos", () => {
    const base = { ...newWorkout(2), sets: { [lift.id]: [manual] } };
    const change = (workout, ex, patch) => updateExercise(workout, day, ex, patch);
    const local = change(change(base, lift, { index: 0, field: "reps", value: "7" }), lift, { note: "Pausa" });
    const remote = change(change(base, lift, { index: 0, field: "kg", value: "80" }), other, { note: "Tempo" });
    const merged = receiveWorkout("u", "día", { revision: 6, workout: remote },
        { scope: "u", key: "día", revision: 5, pending: true, base, workout: local }, day);
    assert.equal(merged.conflict, undefined);
    assert.equal(merged.revision, 6);
    assert.equal(merged.pending, true);
    assert.equal(merged.base, remote);
    assert.deepEqual(merged.workout.sets[lift.id][0], { ...manual, reps: "7", kg: "80", confirmed: true });
    assert.deepEqual(merged.workout.exerciseNotes, { [lift.id]: "Pausa", [other.id]: "Tempo" });
    assert.equal(merged.workout.note, "Squat: Pausa\nSquat: Tempo");
});

test("elegir un valor en conflicto conserva los cambios compatibles en ambas ramas", () => {
    const base = newWorkout(null);
    const local = updateExercise(updateExercise(base, day, lift, { note: "Nota local" }), day, lift, { index: 0, confirmed: true });
    const remote = { ...updateExercise(base, day, lift, { note: "Nota remota" }), rating: 3 };
    const { differences } = reconcileWorkout(base, local, remote, day);
    assert.equal(differences.length, 1);
    assert.deepEqual([differences[0].local, differences[0].remote], ["Nota local", "Nota remota"]);
    for (const source of ["remote", "local"]) {
        const { workout } = reconcileWorkout(base, local, remote, day, { [differences[0].id]: source });
        assert.equal(workout.note, "Squat: " + (source === "local" ? "Nota local" : "Nota remota"));
        assert.equal(workout.sets[lift.id][0].confirmed, true);
        assert.equal(workout.rating, 3);
    }
});

test("una sesión previa a la actualización conserva ambas copias si falta el antecesor", () => {
    const base = { ...newWorkout(1), note: "Nota anterior" };
    const remote = { ...base, rating: 2 }, local = { ...base, note: "Borrador" };
    const result = receiveWorkout("u", "día", { revision: 9, workout: remote },
        { scope: "u", key: "día", revision: 8, pending: true, workout: local }, day);
    assert.equal(result.workout, local);
    assert.equal(result.conflict.workout, remote);
    const { differences } = reconcileWorkout(undefined, local, remote, day);
    assert.deepEqual(differences.map(d => d.label), ["Nota de la sesión", "Cómo te sentiste"]);
    const picks = Object.fromEntries(differences.map(d => [d.id, d.label === "Nota de la sesión" ? "local" : "remote"]));
    assert.deepEqual(reconcileWorkout(undefined, local, remote, day, picks).workout, { ...local, rating: 2 });
});

test("marcar en bloque frente a una edición concurrente mantiene las series con su historial de deshacer", () => {
    const base = newWorkout(null);
    const local = updateExercise(base, day, lift, { checked: true });
    const remote = updateExercise(base, day, lift, { index: 1, field: "kg", value: "100" });
    const { differences } = reconcileWorkout(base, local, remote, day);
    assert.equal(differences.length, 1);
    assert.match(differences[0].remote, /100 kg/);
    assert.equal(reconcileWorkout(base, local, remote, day, { [differences[0].id]: "local" }).workout, local);
});

test("dos marcas del último set con distinta hora automática representan la misma finalización", () => {
    const one = { ...day, exercises: [{ ...lift, prescription: "1x4" }] };
    const base = newWorkout(null);
    const local = updateExercise(base, one, one.exercises[0], { index: 0, confirmed: true });
    const remote = { ...local, finishedAt: "2026-11-24T23:01:00.000Z" };
    const { workout, differences } = reconcileWorkout(base, local, remote, one);
    assert.deepEqual(differences, []);
    assert.equal(workout, remote);
});

test("los campos admiten cada paso de los formatos de la planilla y rechazan texto ajeno", () => {
    const timed = { ...lift, prescription: '3x30"' };
    for (const [field, value, exercise] of [
        ["reps", "10–12", lift], ["reps", "6 c/u", lift], ["reps", "al fallo", { prescription: "3xal fallo" }],
        ["reps", "0:45", timed], ["reps", "1,5 minutos", timed], ["kg", ",75", lift],
        ["kg", "82.5 kg", lift], ["effort", "@8,5", lift], ["effort", "RIR 0", lift], ["effort", "RPE: 10", lift], ["effort", "RIR 2-3", lift],
    ]) {
        for (let i = 0; i < value.length; i++) assert.notEqual(setInputState(field, value.slice(0, i), exercise), "invalid", value);
        assert.equal(setInputState(field, value, exercise), "complete");
    }
    for (const field of ["reps", "kg", "effort"]) for (const junk of ["Las Heras 123", "1e3", "-3", "3,,7", "5\n6", "💪"]) {
        assert.equal(setInputState(field, junk, lift), "invalid");
    }
    for (const effort of ["RIR 11", "@-1", "RPE: 10.1", "RPE: dos"]) assert.equal(setInputState("effort", effort, lift), "invalid");
    for (const value of ["4 x 6-8", "20 min", "3 x al fallo", "4 × 6 c/u"]) {
        for (let i = 0; i < value.length; i++) assert.notEqual(prescriptionInputState(value.slice(0, i)), "invalid");
        assert.equal(prescriptionInputState(value), "complete");
    }
    for (const value of ["Las Heras", "0 x 8", "3 x 4e5", "5 x 4 x 3"]) assert.equal(prescriptionInputState(value), "invalid");
});
