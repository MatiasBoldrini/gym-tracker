import { type Week, type PersonalRecord } from "@/types";
import { type FatigaDaySummaryRow, type FatigaMuscleRow } from "@/lib/fatiga";

export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO === "true" || process.env.DEMO_MODE === "true";

type DemoExerciseItem = {
    name: string;
    muscle: string;
    categories: string;
    image: string;
};

type DemoRoutineExercise = {
    name: string;
    prescribedSeries: string;
};

type DemoDaySummary = {
    id: number;
    exercisesCount: number;
};

type DemoFatigaData = {
    muscleRows: FatigaMuscleRow[];
    daySummary: FatigaDaySummaryRow[];
    calendarDays: string[];
    intensityByGroupId: Record<string, number>;
};

const baseWeek1: Week = {
    id: 1,
    days: [
        {
            id: 1,
            name: "DIA 1 · Empuje",
            stars: 3,
            exercises: [
                {
                    name: "Press banca plano",
                    prescribedSeries: "4 x 6-8",
                    muscleGroup: "pecho",
                    image: "arnold-press.webp",
                    notes: "Tempo controlado",
                    sets: [
                        { weight: 80, reps: 8 },
                        { weight: 82.5, reps: 7 },
                        { weight: 80, reps: 6 },
                    ],
                },
                {
                    name: "Press militar con barra",
                    prescribedSeries: "3 x 8-10",
                    muscleGroup: "hombro",
                    image: "barbell-front-raise.webp",
                    sets: [
                        { weight: 42.5, reps: 10 },
                        { weight: 45, reps: 9 },
                        { weight: 45, reps: 8 },
                    ],
                },
                {
                    name: "Fondos en paralelas",
                    prescribedSeries: "3 x 8-12",
                    muscleGroup: "triceps",
                    image: "back-extension.webp",
                    sets: [
                        { weight: 0, reps: 12 },
                        { weight: 0, reps: 11 },
                        { weight: 0, reps: 10 },
                    ],
                },
            ],
        },
        {
            id: 2,
            name: "DIA 2 · Tirón",
            stars: 2,
            exercises: [
                {
                    name: "Dominadas pronas",
                    prescribedSeries: "4 x 6-8",
                    muscleGroup: "espalda",
                    image: "barbell-hack-squat.webp",
                    sets: [
                        { weight: 0, reps: 8 },
                        { weight: 0, reps: 7 },
                        { weight: 0, reps: 6 },
                    ],
                },
                {
                    name: "Remo con barra",
                    prescribedSeries: "4 x 8-10",
                    muscleGroup: "espalda",
                    image: "bent-over-row.webp",
                    sets: [
                        { weight: 70, reps: 10 },
                        { weight: 72.5, reps: 9 },
                        { weight: 72.5, reps: 8 },
                    ],
                },
                {
                    name: "Curl con barra",
                    prescribedSeries: "3 x 10-12",
                    muscleGroup: "biceps",
                    image: "barbell-curl.webp",
                    sets: [
                        { weight: 35, reps: 12 },
                        { weight: 35, reps: 11 },
                        { weight: 35, reps: 10 },
                    ],
                },
            ],
        },
        {
            id: 3,
            name: "DIA 3 · Pierna",
            stars: 3,
            exercises: [
                {
                    name: "Sentadilla búlgara",
                    prescribedSeries: "3 x 10-12",
                    muscleGroup: "pierna",
                    image: "barbell-lunge.webp",
                    sets: [
                        { weight: 30, reps: 12 },
                        { weight: 32.5, reps: 11 },
                        { weight: 32.5, reps: 10 },
                    ],
                },
                {
                    name: "Peso muerto rumano",
                    prescribedSeries: "4 x 8-10",
                    muscleGroup: "isquios",
                    image: "barbell-glute-bridge.webp",
                    sets: [
                        { weight: 90, reps: 10 },
                        { weight: 95, reps: 9 },
                        { weight: 95, reps: 8 },
                    ],
                },
                {
                    name: "Elevación de talones",
                    prescribedSeries: "4 x 12-15",
                    muscleGroup: "gemelos",
                    image: "barbell-calf-raise.webp",
                    sets: [
                        { weight: 40, reps: 15 },
                        { weight: 42.5, reps: 14 },
                        { weight: 42.5, reps: 12 },
                    ],
                },
            ],
        },
        {
            id: 4,
            name: "DIA 4 · Core + movilidad",
            stars: 2,
            exercises: [
                {
                    name: "Ab wheel rollout",
                    prescribedSeries: "3 x 10",
                    muscleGroup: "core",
                    image: "ab-wheel-rollout.webp",
                    sets: [
                        { weight: 0, reps: 10 },
                        { weight: 0, reps: 9 },
                        { weight: 0, reps: 8 },
                    ],
                },
                {
                    name: "Plancha",
                    prescribedSeries: "3 x 40s",
                    muscleGroup: "core",
                    image: "ab-wheel-rollout.webp",
                    sets: [
                        { weight: 0, reps: 40 },
                        { weight: 0, reps: 40 },
                        { weight: 0, reps: 35 },
                    ],
                },
            ],
        },
        {
            id: 5,
            name: "DIA 5 · Cardio suave",
            stars: 1,
            exercises: [
                {
                    name: "Caminata inclinada",
                    prescribedSeries: "20 min",
                    muscleGroup: "cardio",
                    image: "ab-wheel-rollout.webp",
                    sets: [{ weight: 0, reps: 20 }],
                },
            ],
        },
    ],
};

const baseWeek2: Week = {
    ...baseWeek1,
    id: 2,
    days: baseWeek1.days.map((d, idx) => ({
        ...d,
        id: d.id,
        name: d.name.replace("·", "· Semana 2"),
        stars: [3, 2, 3, 2, 1][idx] ?? d.stars,
        exercises: d.exercises.map((e) => ({
            ...e,
            sets: (e.sets || []).map((s) => ({
                weight: typeof s.weight === "number" ? s.weight + 2.5 : s.weight,
                reps: s.reps,
            })),
        })),
    })),
};

const baseWeek3: Week = {
    ...baseWeek1,
    id: 3,
    days: baseWeek1.days.map((d, idx) => ({
        ...d,
        id: d.id,
        name: d.name.replace("·", "· Semana 3"),
        stars: [2, 3, 3, 2, 1][idx] ?? d.stars,
        exercises: d.exercises.map((e) => ({
            ...e,
            sets: (e.sets || []).map((s) => ({
                weight: typeof s.weight === "number" ? s.weight + 5 : s.weight,
                reps: s.reps,
            })),
        })),
    })),
};

export const demoWeeksList = [
    { id: 1, name: "Semana 1" },
    { id: 2, name: "Semana 2" },
    { id: 3, name: "Semana 3" },
];

export const demoPrs: PersonalRecord[] = [
    { exercise: "Press banca plano", weight: 100, reps: 1, date: "2024-12-02", estimated1RM: 103 },
    { exercise: "Sentadilla búlgara", weight: 42.5, reps: 8, date: "2024-12-04", estimated1RM: 52 },
    { exercise: "Peso muerto rumano", weight: 110, reps: 6, date: "2024-12-05", estimated1RM: 123 },
    { exercise: "Dominadas", weight: 12, reps: 6, date: "2024-12-01", estimated1RM: 25 },
];

export const demoFatiga: DemoFatigaData = {
    muscleRows: [
        { muscle: "Pecho", series: 16, frequency: 2, calendar: [4, 0, 0, 4, 0, 4, 4] },
        { muscle: "Espalda", series: 18, frequency: 2, calendar: [0, 6, 0, 6, 0, 6, 0] },
        { muscle: "Hombro", series: 12, frequency: 2, calendar: [4, 0, 0, 4, 0, 0, 0] },
        { muscle: "Biceps", series: 10, frequency: 1, calendar: [0, 10, 0, 0, 0, 0, 0] },
        { muscle: "Triceps", series: 10, frequency: 1, calendar: [10, 0, 0, 0, 0, 0, 0] },
        { muscle: "Pierna", series: 18, frequency: 2, calendar: [0, 0, 18, 0, 0, 0, 0] },
        { muscle: "Core", series: 9, frequency: 1, calendar: [0, 0, 0, 9, 0, 0, 0] },
        { muscle: "Cardio", series: 5, frequency: 1, calendar: [0, 0, 0, 0, 5, 0, 0] },
    ],
    daySummary: [
        { day: "Lun", dayNumber: "1", avgStars: 3, series: 14 },
        { day: "Mar", dayNumber: "2", avgStars: 2, series: 16 },
        { day: "Mié", dayNumber: "3", avgStars: 3, series: 18 },
        { day: "Jue", dayNumber: "4", avgStars: 2, series: 9 },
        { day: "Vie", dayNumber: "5", avgStars: 1, series: 5 },
    ],
    calendarDays: ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"],
    intensityByGroupId: {
        chest: 16,
        lats: 18,
        "rear-shoulders": 12,
        "front-shoulders": 12,
        biceps: 10,
        triceps: 10,
        quads: 18,
        hamstrings: 18,
        calves: 9,
        abdominals: 9,
    },
};

export const demoExercises: DemoExerciseItem[] = [
    { name: "Press banca plano", muscle: "Pecho", categories: "Empuje", image: "arnold-press.webp" },
    { name: "Press militar", muscle: "Hombro", categories: "Empuje", image: "barbell-front-raise.webp" },
    { name: "Fondos en paralelas", muscle: "Triceps", categories: "Empuje", image: "back-extension.webp" },
    { name: "Dominadas", muscle: "Espalda", categories: "Tracción", image: "barbell-hack-squat.webp" },
    { name: "Remo con barra", muscle: "Espalda", categories: "Tracción", image: "bent-over-row.webp" },
    { name: "Curl con barra", muscle: "Biceps", categories: "Aislado", image: "barbell-curl.webp" },
    { name: "Sentadilla búlgara", muscle: "Pierna", categories: "Patas", image: "barbell-lunge.webp" },
    { name: "Peso muerto rumano", muscle: "Isquios", categories: "Patas", image: "barbell-glute-bridge.webp" },
    { name: "Elevación de talones", muscle: "Gemelos", categories: "Patas", image: "barbell-calf-raise.webp" },
    { name: "Ab wheel rollout", muscle: "Core", categories: "Core", image: "ab-wheel-rollout.webp" },
    { name: "Caminata inclinada", muscle: "Cardio", categories: "Cardio", image: "ab-wheel-rollout.webp" },
];

export const demoSeriesOptions = ["3 x 8-10", "4 x 6-8", "4 x 12-15", "3 x 10-12", "20 min"];

export const demoRoutineDays: Record<number, DemoRoutineExercise[]> = {
    1: baseWeek1.days[0].exercises.map(({ name, prescribedSeries }) => ({ name, prescribedSeries })),
    2: baseWeek1.days[1].exercises.map(({ name, prescribedSeries }) => ({ name, prescribedSeries })),
    3: baseWeek1.days[2].exercises.map(({ name, prescribedSeries }) => ({ name, prescribedSeries })),
    4: baseWeek1.days[3].exercises.map(({ name, prescribedSeries }) => ({ name, prescribedSeries })),
    5: baseWeek1.days[4].exercises.map(({ name, prescribedSeries }) => ({ name, prescribedSeries })),
};

export const demoRoutineSummary: DemoDaySummary[] = [
    { id: 1, exercisesCount: demoRoutineDays[1].length },
    { id: 2, exercisesCount: demoRoutineDays[2].length },
    { id: 3, exercisesCount: demoRoutineDays[3].length },
    { id: 4, exercisesCount: demoRoutineDays[4].length },
    { id: 5, exercisesCount: demoRoutineDays[5].length },
];

export function cloneWeek(week: Week): Week {
    return structuredClone(week);
}

export function getDemoWeeksMap(): Map<number, Week> {
    return new Map<number, Week>([
        [1, cloneWeek(baseWeek1)],
        [2, cloneWeek(baseWeek2)],
        [3, cloneWeek(baseWeek3)],
    ]);
}

export function getDemoHomeData() {
    return {
        week: cloneWeek(baseWeek1),
        weeks: demoWeeksList,
        prs: demoPrs,
        setupError: null as { message: string; code?: string } | null,
    };
}

export function getDemoFatigaData(): DemoFatigaData {
    return structuredClone(demoFatiga);
}

export function getDemoRoutineDay(dayId: number): DemoRoutineExercise[] {
    const found = demoRoutineDays[dayId];
    return found ? structuredClone(found) : [];
}

export function getDemoRoutineSummary(): DemoDaySummary[] {
    return structuredClone(demoRoutineSummary);
}

export function getDemoExercises(): DemoExerciseItem[] {
    return structuredClone(demoExercises);
}

export function getDemoSeries(): string[] {
    return [...demoSeriesOptions];
}
