import type { Set } from "./types";

export const MAX_SETS = 4;

export type RecordedSet = { reps: number; weight: number };

function isRecordedSet(reps: unknown, weight: unknown): reps is number {
    return typeof reps === "number" && Number.isFinite(reps) && reps > 0 && reps <= 500 &&
        typeof weight === "number" && Number.isFinite(weight) && weight >= 0 && weight <= 500;
}

function sheetNumber(value: unknown): number {
    if (typeof value === "number") return value;
    return typeof value === "string" ? Number.parseFloat(value.replace(",", ".")) : NaN;
}

export function parseRowSets(row: readonly unknown[]): Set[] {
    return Array.from({ length: MAX_SETS }, (_, index) => {
        const reps = sheetNumber(row[5 + index * 2]);
        const weight = sheetNumber(row[6 + index * 2]);
        return isRecordedSet(reps, weight) ? { reps, weight } : { reps: null, weight: null };
    });
}

export function parseSetSlots(value: unknown): (RecordedSet | null)[] | null {
    if (!Array.isArray(value) || value.length > MAX_SETS) return null;
    const slots: (RecordedSet | null)[] = [];
    for (const slot of value) {
        if (slot === null || (slot?.reps === null && slot?.weight === null) || (slot?.reps === 0 && slot?.weight === 0)) {
            slots.push(null);
        } else if (isRecordedSet(slot?.reps, slot?.weight)) {
            slots.push({ reps: slot.reps, weight: slot.weight });
        } else {
            return null;
        }
    }
    return slots;
}
