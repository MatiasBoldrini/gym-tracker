import { setInputState } from "@/lib/setInput";
import { useId } from "react";
import { SetRows } from "@/components/ui/SetRows";
import { editableSet, formatLoad, isLoggedSet, isTimed, loadValue, prescribedSetCount, type Exercise, type ExerciseEdit, type PreviousSets, type SetEntry } from "./routine";

type Props = {
    exercise: Exercise; sets?: SetEntry[]; note: string; previous?: PreviousSets;
    showEffort: boolean; invalidIndex?: number; onToggleSet: (index: number, checked: boolean) => void; onEdit: (change: ExerciseEdit) => void;
};

export function BlockSetEditor({ exercise, sets, note, previous, invalidIndex, showEffort, onEdit, onToggleSet }: Props) {
    const noteId = useId();
    const values = Array.from({ length: prescribedSetCount(exercise) }, (_, index) => editableSet(exercise, sets?.[index]));
    const extra = sets?.slice(values.length).filter(set => isLoggedSet(set, exercise)) ?? [];
    const loadHint = exercise.load.trim();
    return <form className="block-set-form" onSubmit={event => event.preventDefault()} aria-label={`Series de ${exercise.name}`}>
        <fieldset>
            <div className="block-set-series">
                {previous && <p className="previous-sets">
                    <strong>Anterior · Semana {previous.week}, día {previous.day}</strong><br />
                    {previous.sets.map(set => [
                        set.reps + (previous.timed ? "" : " reps"), formatLoad(set.kg), showEffort && set.effort,
                    ].filter(Boolean).join(" · ")).join(" / ")}
                </p>}
                {loadHint && !/^[-—]$/.test(loadHint) && loadValue(loadHint) === null && <p className="previous-sets">Carga indicada · {loadHint}</p>}
                {showEffort && exercise.effort && <p className="previous-sets">Esfuerzo indicado · {exercise.effort}</p>}
                <SetRows values={values} onChange={(index, field, value) => onEdit({ index, field, value })}
                    completion={{ checked: values.map((_, i) => !!sets?.[i] && isLoggedSet(sets[i], exercise)), toggle: onToggleSet }}
                    invalidIndex={invalidIndex} exercise={exercise}
                    showEffort={showEffort || (invalidIndex !== undefined && setInputState("effort", values[invalidIndex]?.effort ?? "", exercise) !== "complete")} />
                {extra.length > 0 && <p className="previous-sets">Series adicionales del registro anterior · {extra.map(s =>
                    [s.reps + (isTimed(exercise) ? "" : " reps"), formatLoad(s.kg), showEffort && s.effort].filter(Boolean).join(" · ")
                ).join(" / ")}</p>}
            </div>
            <label htmlFor={noteId} className="exercise-note">Nota del ejercicio
                <textarea id={noteId} rows={2} placeholder="Escribí una nota…" value={note} onChange={event => onEdit({ note: event.target.value })} />
            </label>
        </fieldset>
    </form>;
}
