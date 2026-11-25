import { setInputState } from "../../lib/setInput.ts";
import { formatLoad, isTimed, loadValue, validReps } from "../../../../../supabase/functions/_shared/block-set-input.mjs";

export { formatLoad, isTimed, loadValue, validReps };

export type Exercise = {
  id: string;
  name: string;
  effort: string;
  prescription: string;
  load: string;
};

export type Day = {
  number: number;
  exercises: Exercise[];
  note: string;
  rating: number | null;
};

export type Week = { number: number; days: Day[] };
export type Block = { id: string; name: string; startDate: string; weeks: Week[] };
export type ActivationGroup = {
  name: string;
  exercises: { name: string; sets: string; reps: string }[];
};
export type Routine = {
  spreadsheetId?: string;
  properties?: { title: string };
  blocks: Block[];
  activation: ActivationGroup[];
  catalog: { name: string; muscle: string }[];
  rpe: { columns: number[]; rows: number[][] };
};

type SetValues = { reps: string; kg: string; effort: string };
// A check can add a whole set (null) or fill an existing set's missing fields.
// Editing the set manually removes this snapshot and makes the row the athlete's own.
type SavedSet = SetValues & { confirmed?: boolean };
export type SetEntry = SavedSet & { beforePlan?: SavedSet | null };
export type PreviousSets = { week: number; day: number; sets: SetEntry[]; timed: boolean };

export type Workout = {
  startedAt: string;
  finishedAt?: string;
  note: string;
  exerciseNotes?: Record<string, string>;
  legacyNote?: string;
  rating: number | null;
  completed?: Record<string, boolean>;
  sets: Record<string, SetEntry[]>;
};

export type WorkoutLog = Record<string, Workout>;
export const logStorageKey = 'gym-bloques:workouts:v1';

export function hasExerciseRecord(workout: Workout | undefined, id: string) {
  return Boolean(workout?.sets[id]?.length || workout?.completed?.[id] || workout?.exerciseNotes?.[id]);
}

export function withExerciseNotes(workout: Workout, day: Day, notes = workout.exerciseNotes): Workout {
  if (!notes) return workout;
  // Older sessions have a single free-text note that cannot be assigned to an exercise.
  const legacyNote = workout.exerciseNotes ? workout.legacyNote : workout.note || undefined;
  const lines = day.exercises.filter(exercise => notes[exercise.id]?.trim())
    .map(exercise => `${exercise.name}: ${notes[exercise.id].trim()}`);
  const note = [legacyNote, ...lines].filter(Boolean).join("\n");
  return { ...workout, legacyNote, exerciseNotes: notes, note };
}

const blockLabels: Record<string, string> = {
  dev1: 'Desarrollo 01',
  dev2: 'Desarrollo 02',
  dev3: 'Desarrollo 03',
  dev4: 'Desarrollo 04',
  atack1: 'Ataque 01',
};

export const numberFormat = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });

export const sessionRatings = [
  { value: 1, label: "Una estrella" },
  { value: 2, label: "Dos estrellas" },
  { value: 3, label: "Tres estrellas" },
] as const;

export function blockLabel(block: Block) {
  return blockLabels[block.id] ?? block.name;
}

export function sessionKey(block: Block, week: Week, day: Day) {
  return JSON.stringify([block.id, week.number, day.number]);
}

export function dayForSession(routine: Routine | undefined, key: string) {
  const [block, week, day] = JSON.parse(key) as [string, number, number];
  return routine?.blocks.find(b => b.id === block)?.weeks.find(w => w.number === week)?.days.find(d => d.number === day);
}

// Match the same occurrence when a day prescribes a main lift and a back-off separately.
export function previousLoggedSets(block: Block, week: Week, day: Day, exercise: Exercise, log: WorkoutLog): PreviousSets | undefined {
  const sameName = (entry: Exercise) => entry.name.trim().toLowerCase() === exercise.name.trim().toLowerCase();
  const occurrence = day.exercises.filter(sameName).findIndex(entry => entry.id === exercise.id);
  let previous: PreviousSets | undefined;
  for (const candidateWeek of block.weeks) {
    for (const candidateDay of candidateWeek.days) {
      if (candidateWeek.number === week.number && candidateDay.number === day.number) return previous;
      const session = log[sessionKey(block, candidateWeek, candidateDay)];
      if (!session) continue;
      const earlier = candidateDay.exercises.filter(sameName)[occurrence];
      const sets = earlier && session.sets[earlier.id]?.filter(set => isLoggedSet(set, earlier));
      if (sets?.length) {
        previous = { week: candidateWeek.number, day: candidateDay.number, sets, timed: isTimed(earlier) };
      }
    }
  }
  return previous;
}

export function prescribedSetCount(exercise: Exercise) {
  const count = Number(/^\s*(\d+)\s*[x×]/i.exec(exercise.prescription)?.[1] ?? '1');
  return Math.min(Math.max(count, 1), 30);
}

export const emptySet = (): SetEntry => ({ reps: "", kg: "", effort: "" });

function hasSavedValues(set: SetEntry) {
  return set.confirmed !== undefined || Boolean(set.reps || set.kg || set.effort);
}

function trimEmptyTail(rows: SetEntry[]) {
  let end = rows.length;
  while (end && !hasSavedValues(rows[end - 1])) end--;
  return rows.slice(0, end);
}

export function validSetValues(set: SetValues, exercise?: Exercise) {
  return validReps(set.reps, exercise) && (!set.kg.trim() || loadValue(set.kg) !== null) &&
    (!exercise || setInputState("effort", set.effort, exercise) === "complete");
}

export function isLoggedSet(set: SetEntry, exercise?: Exercise) {
  // Before per-set confirmation, a valid saved row already represented a performed set.
  return set.confirmed !== false && validSetValues(set, exercise);
}

function plannedSet(exercise: Exercise): SetValues {
  const target = exercise.prescription.trim().replace(/^\d+\s*[x×]\s*/i, "");
  const load = loadValue(exercise.load);
  return { reps: /^[-—]$/.test(target) ? "" : target, kg: load === null ? "" : String(load).replace(".", ","), effort: "" };
}

export function editableSet(exercise: Exercise, saved?: SetEntry): SetValues {
  if (saved && (saved.confirmed !== undefined || isLoggedSet(saved, exercise))) {
    const { reps, kg, effort } = saved;
    return { reps, kg, effort };
  }
  const plan = plannedSet(exercise);
  return { reps: saved?.reps || plan.reps, kg: saved?.kg || plan.kg, effort: saved?.effort ?? "" };
}

export function exerciseProgress(workout: Workout | undefined, exercise: Exercise) {
  const target = prescribedSetCount(exercise);
  const count = (workout?.sets[exercise.id] ?? []).slice(0, target).filter(set => isLoggedSet(set, exercise)).length;
  const checked = workout?.completed?.[exercise.id] ?? count === target;
  return { target, count, checked };
}

export function setsForCompletion(exercise: Exercise, sets: SetEntry[], checked: boolean): SetEntry[] {
  const count = prescribedSetCount(exercise);
  const result = [...sets];
  if (!checked) {
    const plannedRows = sets.slice(0, count);
    const undoBulk = plannedRows.some(set => set.beforePlan !== undefined);
    const clearManual = !undoBulk && plannedRows.filter(set => isLoggedSet(set, exercise)).length === count;
    for (let index = 0; index < Math.min(count, sets.length); index++) {
      const set = sets[index];
      if (set.beforePlan !== undefined) result[index] = set.beforePlan ?? emptySet();
      else if (clearManual && isLoggedSet(set, exercise)) result[index] = { ...set, confirmed: false };
    }
    return trimEmptyTail(result);
  }

  const startingBulk = sets.slice(0, count).filter(set => isLoggedSet(set, exercise)).length < count;
  for (let index = 0; index < count; index++) {
    const saved = sets[index];
    const values = editableSet(exercise, saved);
    // Old manual entries may have recorded just the reps. The bulk shortcut historically supplied their load.
    if (saved && saved.confirmed === undefined && !values.kg) values.kg = plannedSet(exercise).kg;
    if (!validSetValues(values, exercise)) return sets;
    if (saved && isLoggedSet(saved, exercise) && saved.kg === values.kg) {
      // A new bulk check must preserve rows that were already checked when it started.
      if (startingBulk && saved.beforePlan !== undefined) result[index] = { ...values, confirmed: true };
      continue;
    }
    const beforePlan = saved && hasSavedValues(saved) ? saved : null;
    result[index] = { ...values, confirmed: true, beforePlan };
  }
  return result;
}

export type SetField = keyof SetValues;
export type ExerciseEdit = { index: number; field: SetField; value: string } | { index: number; confirmed: boolean } | { note: string };
export type ExerciseUpdate = ExerciseEdit | { checked: boolean };

export function updateExercise(workout: Workout, day: Day, exercise: Exercise, change: ExerciseUpdate): Workout {
  const id = exercise.id;
  if ("note" in change) {
    const notes = { ...workout.exerciseNotes };
    if (change.note) notes[id] = change.note;
    else delete notes[id];
    return withExerciseNotes(workout, day, notes);
  }
  const sets = { ...workout.sets };
  const completed = { ...workout.completed };
  let rows = [...(sets[id] ?? [])];
  if ("checked" in change) {
    rows = setsForCompletion(exercise, rows, change.checked);
    const target = prescribedSetCount(exercise);
    if (change.checked && rows.slice(0, target).filter(set => isLoggedSet(set, exercise)).length !== target) return workout;
    completed[id] = change.checked;
  } else {
    const index = change.index;
    if (!Number.isInteger(index) || index < 0 || index >= prescribedSetCount(exercise)) return workout;
    const saved = rows[index];
    const values = editableSet(exercise, saved);
    const confirmed = saved?.confirmed ?? Boolean(saved && isLoggedSet(saved, exercise));
    while (rows.length <= index) rows.push(emptySet());
    if ("confirmed" in change) {
      if (change.confirmed && !validSetValues(values, exercise)) return workout;
      rows[index] = { ...values, confirmed: change.confirmed };
    } else {
      if (setInputState(change.field, change.value, exercise) === "invalid") return workout;
      const edited = { ...values, [change.field]: change.value };
      rows[index] = { ...edited, confirmed: confirmed && validSetValues(edited, exercise) };
    }
    delete completed[id];
  }
  rows = trimEmptyTail(rows);
  if (rows.length) sets[id] = rows;
  else delete sets[id];
  const next = { ...workout, sets, completed };
  const allDone = (w: Workout) => day.exercises.length > 0 && day.exercises.every(e => exerciseProgress(w, e).checked);
  if (allDone(next)) next.finishedAt ??= new Date().toISOString();
  else if (workout.finishedAt && allDone(workout)) delete next.finishedAt;
  return next;
}

export function newWorkout(rating: Day["rating"]): Workout {
  return { startedAt: new Date().toISOString(), note: '', rating, sets: {} };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textFields(value: Record<string, unknown>, fields: string[]) {
  return fields.every(field => typeof value[field] === "string");
}

function numberedRows<T extends { number: number }>(value: unknown, validate: (v: unknown) => v is T): value is T[] {
  return Array.isArray(value) && value.length > 0 && value.every(validate)
    && new Set(value.map(row => row.number)).size === value.length;
}

function isExercise(value: unknown): value is Exercise {
  return record(value) && textFields(value, ["id", "name", "effort", "prescription", "load"]);
}

function isDay(value: unknown): value is Day {
  if (!record(value) || !Number.isInteger(value.number) || typeof value.note !== "string") return false;
  if (value.rating !== null && !(typeof value.rating === "number" && [1, 2, 3].includes(value.rating))) return false;
  return Array.isArray(value.exercises) && value.exercises.every(isExercise)
    && new Set(value.exercises.map(e => e.id)).size === value.exercises.length;
}

function isWeek(value: unknown): value is Week {
  return record(value) && Number.isInteger(value.number) && numberedRows(value.days, isDay);
}

function isBlock(value: unknown): value is Block {
  return record(value) && textFields(value, ["id", "name", "startDate"]) && numberedRows(value.weeks, isWeek);
}

function isActivation(value: unknown): value is ActivationGroup {
  return record(value) && typeof value.name === "string" && Array.isArray(value.exercises)
    && value.exercises.every(e => record(e) && textFields(e, ["name", "sets", "reps"]));
}

function numericRow(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(Number.isFinite);
}

export function parseRoutine(value: unknown): Routine {
  const invalid = () => new Error("El archivo no tiene el formato de rutina esperado.");
  if (!record(value)) throw invalid();
  const { blocks, activation, catalog, rpe } = value;
  if (!Array.isArray(blocks) || !blocks.length || !blocks.every(isBlock)
    || new Set(blocks.map(b => b.id)).size !== blocks.length) throw invalid();
  if (!Array.isArray(activation) || !activation.every(isActivation)) throw invalid();
  if (!Array.isArray(catalog) || !catalog.every(e => record(e) && textFields(e, ["name", "muscle"]))) throw invalid();
  if (!record(rpe) || !numericRow(rpe.columns) || !Array.isArray(rpe.rows)) throw invalid();
  const columns = rpe.columns;
  if (!rpe.rows.every(row => numericRow(row) && row.length === columns.length + 1)) throw invalid();
  const spreadsheetId = typeof value.spreadsheetId === "string" ? value.spreadsheetId.trim() : "";
  const title = record(value.properties) && typeof value.properties.title === "string" ? value.properties.title.trim() : "";
  return { ...(spreadsheetId && { spreadsheetId }), ...(title && { properties: { title } }),
    blocks, activation, catalog, rpe: { columns, rows: rpe.rows } };
}
