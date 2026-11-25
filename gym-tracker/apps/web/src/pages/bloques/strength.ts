import { normalizeExerciseKey } from "../../../../../shared/normalize.ts";
import {
    blockLabel, isLoggedSet, isTimed, loadValue, sessionKey, type Routine, type WorkoutLog,
} from "./routine.ts";

export type StrengthMetric = "load" | "estimate";
type WeeklyBest = Record<StrengthMetric, number | null>;
export type StrengthWeek = { key: string; block: string; week: number; planned: WeeklyBest; recorded: WeeklyBest };

export function movementNames(routine?: Routine) {
    const names = new Map<string, string>();
    for (const block of routine?.blocks ?? []) {
        for (const week of block.weeks) for (const day of week.days) for (const { name } of day.exercises) {
            const key = normalizeExerciseKey(name);
            if (key && !names.has(key)) names.set(key, name.trim());
        }
    }
    return [...names.values()].sort((a, b) => a.localeCompare(b, "es"));
}

// Gym Tracker stores the reps in the first cell of each RPE row, followed by fractions of 1RM.
function estimateMax(kg: number, reps: string, effort: string, table: Routine["rpe"]) {
    if (kg <= 0 || !/^\d+$/.test(reps.trim()) || Number(reps) < 1) return null;
    const match = /^(?:(RIR|RPE|@)\s*)?(\d+(?:[.,]\d+)?)$/i.exec(effort.trim());
    if (!match) return null;
    const value = Number(match[2].replace(",", "."));
    const rpe = match[1]?.toUpperCase() === "RIR" ? 10 - value : value;
    const column = table.columns.indexOf(rpe);
    if (column < 0 || rpe <= 0 || rpe > 10) return null;
    const fraction = table.rows.find(row => row[0] === Number(reps))?.[column + 1];
    return fraction && fraction > 0 && fraction <= 1 ? kg / fraction : null;
}

export function strengthHistory(routine: Routine, log: WorkoutLog, name: string): StrengthWeek[] {
    const key = normalizeExerciseKey(name);
    function update(best: WeeklyBest, rawLoad: string, reps: string, effort: string, timed: boolean) {
        const kg = loadValue(rawLoad);
        if (kg === null || !Number.isFinite(kg)) return;
        best.load = Math.max(best.load ?? kg, kg);
        const estimate = timed ? null : estimateMax(kg, reps, effort, routine.rpe);
        if (estimate !== null) best.estimate = Math.max(best.estimate ?? estimate, estimate);
    }
    return routine.blocks.flatMap(block => block.weeks.map(week => {
        const planned: WeeklyBest = { load: null, estimate: null };
        const recorded: WeeklyBest = { load: null, estimate: null };
        for (const day of week.days) {
            const workout = log[sessionKey(block, week, day)];
            for (const exercise of day.exercises) {
                if (normalizeExerciseKey(exercise.name) !== key) continue;
                const timed = isTimed(exercise);
                const reps = exercise.prescription.trim().replace(/^\d+\s*[x×]\s*/i, "");
                update(planned, exercise.load, reps, exercise.effort, timed);
                for (const set of workout?.sets[exercise.id] ?? []) {
                    if (isLoggedSet(set, exercise)) update(recorded, set.kg, set.reps, set.effort, timed);
                }
            }
        }
        return { key: JSON.stringify([block.id, week.number]), block: blockLabel(block), week: week.number, planned, recorded };
    }));
}
