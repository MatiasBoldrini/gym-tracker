import { memo, useState } from "react";
import { ExerciseList } from "@/components/ui/ExerciseList";
import { ExerciseImageButton } from "./ExerciseGallery";
import { BlockSetEditor } from "./BlockSetEditor";
import { editableSet, exerciseProgress, prescribedSetCount, previousLoggedSets, sessionKey, updateExercise, validSetValues,
    type Block, type ExerciseEdit, type Week, type Day, type Workout, type WorkoutLog } from "./routine";

type DayProps = {
    day: Day; workout?: Workout;
    previous: (exercise: Day["exercises"][number]) => ReturnType<typeof previousLoggedSets>;
    update: (change: (workout: Workout) => Workout) => Promise<boolean>;
    onEdit: (id: string, edit: ExerciseEdit) => void;
    showEffort: boolean;
};

type TrainingProps = {
    block: Block; week: Week; day: Day; log: WorkoutLog; showEffort: boolean;
    saveWorkout: (key: string, rating: Day["rating"], change: (workout: Workout) => Workout) => Promise<boolean>;
    editExercise: (key: string, day: Day, id: string, edit: ExerciseEdit) => void;
};

export const BlockTraining = memo(function BlockTraining({ block, week, day, log, saveWorkout, editExercise, showEffort }: TrainingProps) {
    const key = sessionKey(block, week, day);
    return <WorkoutDay key={key} day={day} workout={log[key]} showEffort={showEffort}
        update={change => saveWorkout(key, day.rating, change)} onEdit={(id, edit) => editExercise(key, day, id, edit)}
        previous={exercise => previousLoggedSets(block, week, day, exercise, log)} />;
});

function WorkoutDay({ day, workout, update, onEdit, previous, showEffort }: DayProps) {
    const [activeId, setActiveId] = useState<string>();
    const [invalidSet, setInvalidSet] = useState<{ id: string; index: number }>();
    function toggleCompletion(id: string, checked: boolean, index?: number) {
        const exercise = day.exercises.find(e => e.id === id);
        if (!exercise) return;
        if (checked) {
            const indices = index === undefined ? Array.from({ length: prescribedSetCount(exercise) }, (_, i) => i) : [index];
            const invalid = indices.find(i => !validSetValues(editableSet(exercise, workout?.sets[id]?.[i]), exercise));
            if (invalid !== undefined) {
                setActiveId(id);
                setInvalidSet({ id, index: invalid });
                return;
            }
        }
        setInvalidSet(undefined);
        if (index !== undefined) {
            onEdit(id, { index, confirmed: checked });
            return;
        }
        void update(w => updateExercise(w, day, exercise, { checked }));
    }
    const rows = day.exercises.map(exercise => {
        const progress = exerciseProgress(workout, exercise);
        return {
            id: exercise.id, name: exercise.name, prescription: exercise.prescription,
            completed: progress.checked,
            progress,
        };
    });
    const sessionNote = workout?.finishedAt ? workout.note : workout?.legacyNote ?? (!workout?.exerciseNotes ? workout?.note : "");
    return <section aria-label="Entrenamiento del día" className="workout-section">
        <h2 className="sr-only">Entrenamiento del día</h2>
        {day.note && <p className="plan-note">{day.note}</p>}
        {rows.length ? <ExerciseList rows={rows} activeId={activeId}
            renderMedia={row => <ExerciseImageButton name={row.name} />}
            onSelect={id => setActiveId(current => current === id ? undefined : id)}
            onToggle={toggleCompletion}
            renderEditor={id => {
                const exercise = day.exercises.find(e => e.id === id);
                if (!exercise) return null;
                return <BlockSetEditor showEffort={showEffort} exercise={exercise} sets={workout?.sets[id]} note={workout?.exerciseNotes?.[id] ?? ""}
                    invalidIndex={invalidSet?.id === id ? invalidSet.index : undefined} previous={previous(exercise)}
                    onToggleSet={(index, checked) => { void toggleCompletion(id, checked, index); }}
                    onEdit={edit => { setInvalidSet(undefined); onEdit(id, edit); }} />;
            }} /> : <p className="px-6 py-3">Este día está libre.</p>}
        {sessionNote && sessionNote.trim() !== day.note.trim() && <p className="session-end-note summary-note">{sessionNote}</p>}
    </section>;
}
