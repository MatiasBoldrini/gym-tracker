type ExerciseInput = { prescription: string };

export function isTimed(exercise: ExerciseInput): boolean;
export function loadValue(value: string): number | null;
export function formatLoad(value: string): string;
export function validReps(value: string, exercise?: ExerciseInput): boolean;
