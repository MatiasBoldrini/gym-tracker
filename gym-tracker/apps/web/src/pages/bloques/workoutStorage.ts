import { logStorageKey, newWorkout, updateExercise, type Day, type ExerciseEdit, type Workout, type WorkoutLog } from "./routine";

// The latest edit to each field survives even if the page closes before the batched history write.
const draftPrefix = "gym-bloques:exercise-draft:v1:";
type Draft = { key: string; day: Day; exerciseId: string; edit: ExerciseEdit };

export function stageEdit(draft: Draft) {
    const { key, exerciseId, edit } = draft;
    const field = "note" in edit ? ["note"] : [edit.index, "confirmed" in edit ? "confirmed" : edit.field];
    localStorage.setItem(draftPrefix + JSON.stringify([key, exerciseId, ...field]), JSON.stringify(draft));
}

function readDrafts() {
    return Object.keys(localStorage).filter(key => key.startsWith(draftPrefix)).map(key => {
        const raw = localStorage.getItem(key);
        return { key, raw, draft: raw ? JSON.parse(raw) as Draft : undefined };
    });
}

function readHistory(): WorkoutLog {
    const log = JSON.parse(localStorage.getItem(logStorageKey) ?? "{}");
    if (!log || typeof log !== "object" || Array.isArray(log)) throw new Error("Historial inválido");
    return log;
}

export function applyEdit(log: WorkoutLog, { key, day, exerciseId, edit }: Draft): WorkoutLog {
    const exercise = day.exercises.find(e => e.id === exerciseId);
    if (!exercise) return log;
    return { ...log, [key]: updateExercise(log[key] ?? newWorkout(day.rating), day, exercise, edit) };
}

export function readWorkouts(drafts = readDrafts()) {
    return drafts.reduce((log, { draft }) => draft ? applyEdit(log, draft) : log, readHistory());
}

export async function writeWorkouts(change?: { key: string; initialRating: Day["rating"]; update: (w: Workout) => Workout }) {
    const write = () => {
        const drafts = readDrafts();
        if (!change && !drafts.length) return;
        const log = readWorkouts(drafts);
        if (drafts.length) {
            localStorage.setItem(logStorageKey, JSON.stringify(log));
            for (const { key, raw } of drafts) {
                if (localStorage.getItem(key) === raw) localStorage.removeItem(key);
            }
        }
        if (change) {
            log[change.key] = change.update(log[change.key] ?? newWorkout(change.initialRating));
            localStorage.setItem(logStorageKey, JSON.stringify(log));
        }
    };
    if (navigator.locks) await navigator.locks.request(logStorageKey, write);
    else write();
}
