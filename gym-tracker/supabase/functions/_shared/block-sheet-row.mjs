import { renderSet, seriesLabel, valuesFor } from "./block-workout-export.mjs";

import { loadValue, validReps } from "./block-set-input.mjs";

export class SheetConflict extends Error {}
const same = (a, b) => (a ?? "") === (b ?? "");
const clean = (value) => String(value ?? "").trim();
const normal = (value) => clean(value).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export function findDay(routine, row) {
    const label = normal(row[0]);
    const block = routine.blocks.find((b) => [b.id, b.name].some((v) => normal(v) === label));
    const weekNumber = Number(normal(row[1]).replace(/^semana\s+/, ""));
    const dayNumber = Number(normal(row[2]).replace(/^dia\s+/, ""));
    const week = block?.weeks.find((w) => w.number === weekNumber);
    const day = week?.days.find((d) => d.number === dayNumber);
    if (!day) throw new SheetConflict("Revisá bloque, semana y día de la rutina asignada.");
    return {
        day,
        key: JSON.stringify([block.id, week.number, day.number]),
        names: Object.fromEntries(day.exercises.map((e) => [e.id, e.name])),
    };
}

function wallTime(ms, zone) {
    const format = new Intl.DateTimeFormat("sv-SE", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
        timeZone: zone || "UTC",
    });
    let candidate = ms;
    for (let i = 0; i < 3; i++) {
        const localMs = Date.parse(format.format(new Date(candidate)).replace(" ", "T") + "Z");
        const offset = ms - localMs;
        if (!offset) break;
        candidate += offset;
    }
    return new Date(candidate).toISOString();
}

function date(value, zone) {
    if (value == null || value === "") return "";
    if (typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 200000) {
        return wallTime(Math.round((value - 25569) * 86400) * 1000, zone);
    }
    const s = clean(value);
    const iso = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2}))?$/i.exec(s);
    const local = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?: (\d{1,2}):(\d{2}))?$/.exec(s);
    if (iso || local) {
        const [, y, m, d, h, min, sec] = iso ?? ["", local[3], local[2], local[1], local[4], local[5]];
        const day = new Date(0);
        day.setUTCFullYear(Number(y), Number(m) - 1, Number(d));
        day.setUTCHours(Number(h || 0), Number(min || 0), Number(sec || 0));
        if (
            day.getUTCFullYear() === Number(y) && day.getUTCMonth() + 1 === Number(m) &&
            day.getUTCDate() === Number(d) && day.getUTCHours() === Number(h || 0) &&
            day.getUTCMinutes() === Number(min || 0) && day.getUTCSeconds() === Number(sec || 0)
        ) {
            if (!iso?.[4]) return wallTime(day.getTime(), zone);
            if (Number.isFinite(Date.parse(s))) return new Date(s).toISOString();
        }
    }
    throw new SheetConflict("Usá una fecha de Sheets o una fecha ISO en Inicio y Fin.");
}

export function normalizeCell(index, value, zone) {
    if (index === 3 || index === 4) return date(value, zone);
    if (index === 5) {
        if (clean(value) === "") return "";
        const stars = clean(value);
        if (/^☆{1,3}$/u.test(stars)) return "";
        const n = /^★{1,3}☆{0,2}$/u.test(stars) && stars.length <= 3
            ? stars.split("★").length - 1
            : /^[1-3]$/.test(stars) ? Number(stars) : NaN;
        if (![1, 2, 3].includes(n)) throw new SheetConflict("Las estrellas admiten 1, 2, 3 o una celda vacía.");
        return n;
    }
    const text = String(value ?? "").replace(/\r\n/g, "\n").trimEnd();
    // Previous exports appended a second unit to a weight typed with "kg".
    return index === 6 ? text.replace(/([×x]\s+(?:\d+(?:[.,]\d+)?|[.,]\d+))\s*kg\s+kg(?=\s*(?:\/|·|$))/gim, "$1 kg") : text;
}

function parseSets(value, day, names, prior, priorRendered) {
    const sets = {}, used = new Set();
    const oldLines = new Set(priorRendered.split("\n"));
    for (const line of value.split("\n").filter((s) => s.trim())) {
        // Only a colon after a known exercise label is a delimiter (e.g. effort can be "RPE: 8").
        const parts = line.split(":");
        let exercise, split = -1;
        for (const candidate of day.exercises) {
            if (used.has(candidate.id)) continue;
            for (const label of [candidate.id, seriesLabel(candidate.id, names)]) {
                const length = label.split(":").length;
                if (length >= parts.length) continue;
                const prefix = parts.slice(0, length).join(":");
                if (prefix.length > split && normal(prefix) === normal(label)) {
                    exercise = candidate;
                    split = prefix.length;
                }
            }
        }
        if (!exercise) {
            throw new SheetConflict(
                "En Series, usá una línea por ejercicio con su nombre seguido de dos puntos.",
            );
        }
        used.add(exercise.id);
        if (oldLines.has(line) && prior[exercise.id]) {
            sets[exercise.id] = prior[exercise.id];
            continue;
        }
        sets[exercise.id] = line.slice(split + 1).trim().split(/\s+\/\s+/).map((raw, index) => {
            const old = prior[exercise.id]?.[index];
            if (old && raw.trim() === renderSet(old)) return old;
            const m = /^([✓○]?)\s*(.+?)(?:\s+[×x]\s+((?:\d+(?:[.,]\d+)?|[.,]\d+))\s*kg)?(?:\s+·\s+(.+))?$/.exec(
                raw.trim(),
            );
            if (!m || /\s[×x]\s/i.test(m[2]) || m[2].includes(" · ")) {
                throw new SheetConflict("Usá series como «Sentadilla: ✓ 5 × 80 kg / ○ 4 × 85 kg».");
            }
            const next = {
                reps: m[2] === "—" ? "" : m[2],
                kg: m[3] ?? "",
                effort: m[4] ?? "",
                confirmed: m[1] !== "○",
            };
            if (next.confirmed && (!validReps(next.reps, exercise) || (next.kg && loadValue(next.kg) === null))) {
                throw new SheetConflict("Revisá las repeticiones o el tiempo y la carga de la serie marcada como hecha.");
            }
            if (
                old && old.reps === next.reps && old.kg === next.kg && old.effort === next.effort &&
                (old.confirmed ?? Boolean(old.reps?.trim())) === next.confirmed
            ) return old;
            return next;
        });
    }
    return sets;
}

function exerciseSummary(notes, day) {
    return day.exercises.filter((e) => notes?.[e.id]?.trim())
        .map((e) => e.name + ": " + notes[e.id].trim()).join("\n");
}

// H is the same general note + exercise-prefixed paragraphs shown in the app.
export function changeNote(workout, value, day) {
    const notes = { ...workout.exerciseNotes };
    const generalLines = [];
    const entries = new Map();
    let paragraph = generalLines;
    for (const line of value.split("\n")) {
        const colon = line.indexOf(":");
        const prefix = colon >= 0 ? normal(line.slice(0, colon)) : "";
        const matching = prefix
            ? day.exercises.filter((e) => normal(e.name) === prefix || normal(e.id) === prefix)
            : [];
        if (!matching.length) {
            paragraph.push(line);
            continue;
        }
        const remaining = matching.filter((e) => !entries.has(e.id));
        const exercise = remaining.find((e) => notes[e.id]?.trim() === line.slice(colon + 1).trim()) ??
            remaining.find((e) => notes[e.id]?.trim()) ?? remaining[0];
        if (!exercise) throw new SheetConflict("La nota repite un ejercicio más veces que el plan.");
        paragraph = [line.slice(colon + 1).trimStart()];
        entries.set(exercise.id, paragraph);
    }
    for (const [id, lines] of entries) {
        const text = lines.join("\n").trim();
        if (text) notes[id] = text;
        else delete notes[id];
    }
    const general = generalLines.join("\n").trim();
    if (workout.exerciseNotes || entries.size) {
        workout.exerciseNotes = notes;
        if (general || Object.hasOwn(workout, "legacyNote")) workout.legacyNote = general;
    }
    workout.note = [general, exerciseSummary(notes, day)].filter(Boolean).join("\n");
}

function normalizedNote(workout, text, day) {
    const copy = { ...workout };
    changeNote(copy, text, day);
    return copy.note;
}

// Older imports put the entire replacement in legacyNote and appended the previous exercise note.
// Repair only that exact known state. An unrelated edit on another device still conflicts.
function previousNoteEcho(current, base, input, day) {
    const old = exerciseSummary(base?.exerciseNotes, day);
    return Boolean(
        old && current.legacyNote === input && current.note === input + "\n" + old &&
            exerciseSummary(current.exerciseNotes, day) === old,
    );
}

const labels = ["Bloque", "Semana", "Día", "Inicio", "Fin", "Estrellas", "Series", "Notas"];

// Compare only the columns the coach actually changed. Keep app-only metadata from the current workout.
export function reconcileRow(
    { key, day, names, dbRow, base, raw, expected, captured, original = {}, zone, now },
) {
    const current = dbRow?.workout ?? { startedAt: now, sets: {}, rating: null, note: "" };
    const workout = structuredClone(current);
    const render = (w) =>
        valuesFor({ session_key: key, workout: w, exercise_names: names, revision: 1 }).slice(0, 8);
    const previous = base ? render(base) : [];
    const app = render(current);
    const manual = new Map();
    const resolution = normal(raw[8]);
    const chooseSheet = resolution === "usar hoja", chooseApp = resolution === "usar app";
    for (let i = 3; i < 8; i++) {
        if (!raw.length || chooseApp) continue;
        const was = normalizeCell(i, previous[i], zone);
        let actual = normalizeCell(i, raw[i], zone);
        if (i === 6 && base && actual !== was) {
            const old =
                valuesFor({ session_key: key, workout: base, exercise_names: names, revision: 1 }, true)[6];
            if (actual === old) actual = was;
        }
        const server = normalizeCell(i, app[i], zone);
        const raced = captured && !same(captured[i], expected[i]);
        let from = was, to = actual;
        if (raced && same(actual, was)) {
            from = normalizeCell(i, expected[i], zone);
            to = normalizeCell(i, captured[i], zone);
        }
        if (same(from, to) || same(server, to)) continue;
        if (i === 7 && normalizedNote(current, to, day) === current.note) continue;
        const knownEcho = i === 7 && previousNoteEcho(current, base, to, day);
        if (!chooseSheet && !knownEcho && dbRow && !same(server, from)) {
            throw new SheetConflict("Cambios simultáneos en " + labels[i] + ".");
        }
        manual.set(i, to);
    }
    for (const [field, i] of [["rating", 5], ["note", 7]]) {
        if (!Object.hasOwn(original.patch ?? {}, field) || chooseApp) continue;
        const value = normalizeCell(i, original.patch[field], zone);
        const equivalentNote = i === 7 && manual.has(i) &&
            normalizedNote(current, value, day) === normalizedNote(current, manual.get(i), day);
        if (manual.has(i) && !equivalentNote && !same(value, manual.get(i))) {
            if (chooseSheet) continue;
            throw new SheetConflict("La planificación y Registro app difieren en " + labels[i] + ".");
        }
        manual.set(i, value);
    }
    if (original.conflict && !chooseApp && !chooseSheet) throw new SheetConflict(original.conflict);
    for (const [i, value] of manual) {
        if (i === 3) {
            if (!value) throw new SheetConflict("El inicio del entrenamiento necesita una fecha.");
            workout.startedAt = value;
        }
        if (i === 4) {
            if (value) workout.finishedAt = value;
            else delete workout.finishedAt;
        }
        if (i === 5) workout.rating = value === "" ? null : value;
        if (i === 6) {
            workout.sets = parseSets(value, day, names, current.sets, app[6]);
            for (const e of day.exercises) {
                if (JSON.stringify(workout.sets[e.id] ?? []) !== JSON.stringify(current.sets[e.id] ?? [])) {
                    delete workout.completed?.[e.id];
                }
            }
        }
        if (i === 7) changeNote(workout, value, day);
    }
    if ((manual.has(3) || manual.has(4)) && workout.finishedAt && Date.parse(workout.finishedAt) < Date.parse(workout.startedAt)) {
        throw new SheetConflict("El fin del entrenamiento debe ser igual o posterior al inicio.");
    }
    return workout;
}
