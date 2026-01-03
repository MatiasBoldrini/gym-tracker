export interface Set {
    reps: number | null;
    weight: number | null;
}

export interface Exercise {
    name: string;
    prescribedSeries: string; // e.g., "3 x 8-12"
    notes?: string;
    muscleGroup?: string;
    sets: Set[]; // Actual sets performed
}

export interface Day {
    id: number;
    name: string; // e.g., "DIA 1"
    exercises: Exercise[];
    stars?: number; // 1-3
}

export interface Week {
    id: number;
    days: Day[];
}

export interface PersonalRecord {
    exercise: string;
    weight: number;
    reps: number;
    date: string;
    estimated1RM: number;
}
