import { getFatigaBucket, MUSCLE_ALIASES, type FatigaMuscleRow } from "@/lib/fatiga";
import { normalizeMuscleKey } from "@/lib/normalize";

// IDs match the Free Muscle batches. Zero is reserved for neutral anatomy.
export const bodyZones = [
    { id: 1, name: "Pecho", muscles: ["pecho", "pectoral", "pectorales"] },
    { id: 2, name: "Espalda", muscles: ["espalda", "dorsales", "trapecios"] },
    { id: 3, name: "Hombros", muscles: ["hombro", "hombros", "deltoides"] },
    { id: 4, name: "Brazos", muscles: ["biceps", "triceps", "antebrazos", "antebrazo", "brazos"] },
    { id: 5, name: "Abdomen", muscles: ["abdominales", "abdomen", "core", "oblicuos"] },
    { id: 6, name: "Glúteos", muscles: ["gluteos", "gluteo"] },
    { id: 7, name: "Piernas", muscles: ["cuadriceps", "isquiotibiales", "femorales", "gemelos", "pantorrillas", "aductores", "abductores", "piernas"] },
];
const volumeColors = {
    empty: "#c6c2bb", low: "#6ea592", medium: "#d9aa50", high: "#db805f", extreme: "#ac4963",
};
export function volumeColor(series: number) {
    return volumeColors[getFatigaBucket(series)];
}
export type ZoneVolume = { id: number; name: string; series: number; calendar: (number | null)[] };
export function weeklyZones(rows: FatigaMuscleRow[], days: number): ZoneVolume[] {
    const zones = [...bodyZones, { id: 8, name: "Otros", muscles: [] }].map(({ id, name }) =>
        ({ id, name, series: 0, calendar: Array<number | null>(days).fill(null) }));
    for (const row of rows) {
        const key = normalizeMuscleKey(row.muscle);
        const group = bodyZones.find(zone => zone.muscles.includes(MUSCLE_ALIASES[key] ?? key));
        const zone = zones[(group?.id ?? 8) - 1];
        zone.series += Math.max(0, Number(row.series) || 0);
        row.calendar?.slice(0, days).forEach((value, i) => {
            if (typeof value === "number") zone.calendar[i] = (zone.calendar[i] ?? 0) + value;
        });
    }
    return zones.filter(zone => zone.id !== 8 || zone.series > 0 || zone.calendar.some(value => value !== null));
}
