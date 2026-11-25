import { normalizeExerciseKey } from "@/lib/normalize";
import illustrations from "virtual:exercise-illustrations";

// Los nombres abreviados del entrenador se corresponden con las ilustraciones del catálogo original.
const images: Record<string, string> = {
    "squat comp": "squat", 'squat comp 2"': "pause-squat", "squat comp pausa": "pause-squat",
    "bench comp": "bench-press", "bench comp 330": "bench-press", 'bench comp 3"': "paused-bench-press",
    'press banca 3"': "paused-bench-press", "bench 330": "bench-press", "bench tyg": "bench-press",
    "bench t&g": "bench-press", "bench closegrip": "close-grip-bench-press", "bench inclinado": "incline-bench-press",
    "deadlift comp": "deadlift", "deadlift pausa despegue": "pause-deadlift", "deadlift velocidad": "deadlift",
    "deadlift tempo": "deadlift", "deadlift rumano": "romanian-deadlift", "deadlift rumano mnc": "dumbbell-romanian-deadlift",
    "bulgaras": "bulgarian-split-squat", "jalon prono": "lat-pulldown", "jalon al pecho": "lat-pulldown",
    "jalon supino": "reverse-grip-lat-pulldown", "jalon unilateral": "one-arm-lat-pulldown",
    "remo seal": "bench-pull", "remo barra": "bent-over-row", "remo mancuerna": "dumbbell-row",
    "remo mancuerna unilateral": "dumbbell-row", "remo unilateral": "dumbbell-row",
    "remo polea": "seated-cable-row", "remo polea amplio": "seated-cable-row",
    "press militar mancuerna": "dumbbell-shoulder-press", "rueda abdominal": "ab-wheel-rollout",
    "curl martillo": "hammer-curl", "bicep martillo": "hammer-curl", "curl bicep": "dumbbell-curl",
    "bicep libre": "barbell-curl", "camilla isquio": "lying-leg-curl", "curl femoral": "lying-leg-curl",
    "tricep polea soga": "tricep-rope-pushdown", "tricep pressdown": "tricep-pushdown",
    "tricep polea": "tricep-pushdown", "facepull": "face-pull", "pec deck": "machine-chest-fly",
    "hiperextension lastre": "back-extension", "posterior mancuerna": "dumbbell-reverse-fly",
    "laterales mancuerna": "dumbbell-lateral-raise", "prensa": "sled-leg-press",
    "press frances z": "lying-tricep-extension", "press frances mancuerna": "lying-dumbbell-tricep-extension",
    "press militar con mancuerna": "dumbbell-shoulder-press",
};

const byName = new Map(illustrations.map(item => [normalizeExerciseKey(item.name), item.file]));
const byFile = new Map(illustrations.map(item => [item.file, item]));
export function exerciseImage(name: string) {
    const key = normalizeExerciseKey(name);
    return byName.get(key) ?? (images[key] ? images[key] + ".webp" : undefined);
}

export function illustrationFor(name: string) {
    return byFile.get(exerciseImage(name) ?? "");
}

const aliasesByFile = new Map<string, string[]>();
for (const [name, slug] of Object.entries(images)) {
    const key = slug + ".webp";
    aliasesByFile.set(key, [...(aliasesByFile.get(key) ?? []), name]);
}
export const searchableIllustrations = illustrations.map(item => ({
    ...item, search: normalizeExerciseKey([item.name, item.muscle, ...(aliasesByFile.get(item.file) ?? [])].join(" ")),
})).sort((a, b) => a.name.localeCompare(b.name, "es"));
