import { emptySet, exerciseProgress, formatLoad, isLoggedSet, withExerciseNotes, type Day, type SetEntry, type Workout } from "./routine.ts";

export type Choices = Record<string, "local" | "remote">;
export type Difference = { id: string; label: string; local: string; remote: string };

// PostgreSQL jsonb and IndexedDB can return the same object with different key ordering.
export function sameValue(a: unknown, b: unknown): boolean {
    if (Object.is(a, b)) return true;
    if (!a || !b || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) return false;
    const left = a as Record<string, unknown>, right = b as Record<string, unknown>;
    const keys = Object.keys(left).filter(k => left[k] !== undefined);
    return keys.length === Object.keys(right).filter(k => right[k] !== undefined).length &&
        keys.every(k => Object.hasOwn(right, k) && sameValue(left[k], right[k]));
}

function generalNote(w?: Workout) { return (w?.exerciseNotes ? w.legacyNote : w?.note) || ""; }
function rowAt(rows: SetEntry[], index: number) {
    const row = rows[index];
    return row && !sameValue(row, emptySet()) ? row : undefined;
}
function describeSet(row?: SetEntry): string {
    if (!row) return "Sin registrar";
    const values = [isLoggedSet(row) ? "Hecha" : "Sin marcar", row.reps && "Reps/tiempo " + row.reps,
        formatLoad(row.kg), row.effort].filter(Boolean).join(" · ");
    return row.beforePlan === undefined ? values : values + "\nAl desmarcar el ejercicio: " + describeSet(row.beforePlan ?? undefined);
}

export function reconcileWorkout(base: Workout | undefined, local: Workout, remote: Workout, day: Day, choices: Choices = {}) {
    const differences: Difference[] = [];
    let matchesLocal = true, matchesRemote = true;
    function choose<T>(path: string[], label: string, before: T, here: T, there: T, describe: (value: T) => string): T {
        if (sameValue(here, there)) return there;
        let useRemote;
        if (base && sameValue(before, here)) useRemote = true;
        else if (base && sameValue(before, there)) useRemote = false;
        else {
            const id = JSON.stringify(path);
            differences.push({ id, label, local: describe(here), remote: describe(there) });
            useRemote = choices[id] === "remote";
        }
        if (useRemote) matchesLocal = false;
        else matchesRemote = false;
        return useRemote ? there : here;
    }
    const sets: Workout["sets"] = {}, completed: Record<string, boolean> = {}, notes: Record<string, string> = {};
    const ids = new Set([base, local, remote].flatMap(w => [
        ...Object.keys(w?.sets ?? {}), ...Object.keys(w?.completed ?? {}), ...Object.keys(w?.exerciseNotes ?? {}),
    ]));
    const text = (s: string | undefined) => s || "Vacío";
    const legacy = choose(["note"], "Nota de la sesión", generalNote(base), generalNote(local), generalNote(remote), text);
    for (const id of ids) {
        const name = day.exercises.find(e => e.id === id)?.name ?? id;
        const note = choose(["exerciseNotes", id], name + " · Nota", base?.exerciseNotes?.[id] || "",
            local.exerciseNotes?.[id] || "", remote.exerciseNotes?.[id] || "", text);
        if (note) notes[id] = note;
        const group = (w?: Workout) => ({ checked: w?.completed?.[id], rows: w?.sets[id] ?? [] });
        const [b, l, r] = [base, local, remote].map(group);
        // A bulk check carries undo snapshots for its rows. Keep that operation together.
        if ([b, l, r].some(g => g.checked !== undefined)) {
            const g = choose(["exercise", id], name + " · Ejercicio", b, l, r, v =>
                [v.checked === undefined ? "Por serie" : v.checked ? "Ejercicio marcado" : "Ejercicio desmarcado",
                    ...v.rows.map((row, i) => "Serie " + (i + 1) + " · " + describeSet(row))].join("\n"));
            if (g.rows.length) sets[id] = g.rows;
            if (g.checked !== undefined) completed[id] = g.checked;
        } else {
            const merged: SetEntry[] = [];
            for (let i = 0; i < Math.max(b.rows.length, l.rows.length, r.rows.length); i++) {
                const before = rowAt(b.rows, i), here = rowAt(l.rows, i), there = rowAt(r.rows, i);
                const path = ["sets", id, String(i)], label = name + " · Serie " + (i + 1);
                let row;
                if (before && here && there && here.confirmed === there.confirmed &&
                    [before, here, there].every(set => set.beforePlan === undefined)) {
                    row = { ...there };
                    const fields = { reps: "Reps/tiempo", kg: "Carga", effort: "RPE/RIR" } as const;
                    for (const field of ["reps", "kg", "effort"] as const) {
                        row[field] = choose([...path, field], label + " · " + fields[field],
                            before[field], here[field], there[field], value => text(field === "kg" ? formatLoad(value) : value));
                    }
                    // Both sides already agree on confirmation.
                } else row = choose(path, label, before, here, there, describeSet);
                if (row) {
                    while (merged.length < i) merged.push(emptySet());
                    merged.push(row);
                }
            }
            if (merged.length) sets[id] = merged;
        }
    }

    const rating = choose(["rating"], "Cómo te sentiste", base?.rating ?? null, local.rating, remote.rating,
        n => n === null ? "Sin calificar" : "★".repeat(n));
    const date = (value?: string) => value ? new Date(value).toLocaleString("es-AR", {
        year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 3,
    }) : "Sin registrar";
    const startedAt = choose(["startedAt"], "Inicio del entrenamiento", base?.startedAt, local.startedAt, remote.startedAt, date)!;
    const setsChanged = !sameValue(local.sets, remote.sets) || !sameValue(local.completed, remote.completed);
    const done = (w: Workout) => day.exercises.length > 0 && day.exercises.every(e => exerciseProgress(w, e).checked);
    // Finishing independently on two devices creates two automatic timestamps for one event.
    // Prefer the already recorded finish in that case, including any time entered in Sheets.
    const bothFinished = base && !base.finishedAt && !done(base) && local.finishedAt && remote.finishedAt && done(local) && done(remote);
    let finishedAt = choose(["finishedAt"], "Fin del entrenamiento", bothFinished ? local.finishedAt : base?.finishedAt,
        local.finishedAt, remote.finishedAt, date);
    const historicalSummary = (w?: Workout) => w?.exerciseNotes && withExerciseNotes(w, day).note !== w.note ? w.note : undefined;
    const summary = choose(["summary"], "Resumen de notas", historicalSummary(base), historicalSummary(local), historicalSummary(remote), text);
    // Keep the exact original representation, including historical summaries and optional fields.
    if (matchesRemote) return { workout: remote, differences };
    if (matchesLocal) return { workout: local, differences };
    const workout: Workout = { ...remote, startedAt, rating, sets, note: legacy };
    if (Object.keys(completed).length) workout.completed = completed; else delete workout.completed;
    if (setsChanged && base) {
        if (!finishedAt && done(workout) && !done(local) && !done(remote)) finishedAt = new Date().toISOString();
        if (!done(workout) && ((finishedAt === local.finishedAt && done(local)) || (finishedAt === remote.finishedAt && done(remote)))) finishedAt = undefined;
    }
    if (finishedAt) workout.finishedAt = finishedAt; else delete workout.finishedAt;
    if (local.exerciseNotes || remote.exerciseNotes || Object.keys(notes).length) {
        workout.legacyNote = legacy || undefined;
        workout.exerciseNotes = notes;
        const result = withExerciseNotes(workout, day);
        if (summary !== undefined) result.note = summary;
        return { workout: result, differences };
    }
    delete workout.exerciseNotes;
    delete workout.legacyNote;
    return { workout, differences };
}
