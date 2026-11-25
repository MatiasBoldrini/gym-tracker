import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { SetRows, type SetRow } from "@/components/ui/SetRows";
import type { PersonalRecord, Set } from "@/types";

const setLimit = 4;

export type ClassicExerciseTarget = { weekId: number; dayId: number; rowIndex: number; name: string };

type EditorProps = {
    target: ClassicExerciseTarget;
    record?: PersonalRecord;
    notes?: string;
    load: (target: ClassicExerciseTarget) => Promise<Set[]>;
    save: (target: ClassicExerciseTarget, sets: Set[]) => Promise<void>;
    onClose: () => void;
};

type LoadState =
    | { status: "loading" }
    | { status: "failed"; message: string }
    | { status: "ready"; original: SetRow[]; values: SetRow[] };

function toDraft(sets: Set[]): SetRow[] {
    return Array.from({ length: setLimit }, (_, index) => {
        const set = sets[index];
        return {
            reps: set?.reps == null ? "" : String(set.reps),
            kg: set?.weight == null ? "" : String(set.weight),
            effort: "",
        };
    });
}

function toSets(values: SetRow[]): Set[] {
    const sets = values.map((value, index) => {
        const repsText = value.reps.trim();
        const weightText = value.kg.trim();
        if (!repsText && !weightText) return { reps: null, weight: null };
        if (!repsText || !weightText) {
            throw new Error(`Completá las repeticiones y los kilos de la serie ${index + 1}, o dejá ambos campos vacíos.`);
        }

        const reps = Number(repsText);
        const weight = Number(weightText.replace(",", "."));
        if (!Number.isInteger(reps) || reps < 1 || reps > 500 || !Number.isFinite(weight) || weight < 0 || weight > 500) {
            throw new Error(`Revisá la serie ${index + 1}. Ingresá de 1 a 500 repeticiones y un peso de 0 a 500 kg.`);
        }
        return { reps, weight };
    });
    while (sets.at(-1)?.reps === null) sets.pop();
    return sets;
}

export function ClassicExerciseEditor({ target, record, notes, load, save, onClose }: EditorProps) {
    const [state, setState] = useState<LoadState>({ status: "loading" });
    const [attempt, setAttempt] = useState(0);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const saving = useRef(false);
    const titleId = useId();
    const { weekId, dayId, rowIndex, name } = target;

    useEffect(() => {
        let active = true;
        void load({ weekId, dayId, rowIndex, name }).then(
            (sets) => {
                if (!active) return;
                const values = toDraft(sets);
                setState({ status: "ready", original: values, values });
            },
            (failure: unknown) => {
                if (!active) return;
                setState({
                    status: "failed",
                    message: failure instanceof Error ? failure.message : "No pudimos cargar las series.",
                });
            }
        );
        return () => { active = false; };
    }, [attempt, dayId, load, name, rowIndex, weekId]);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (state.status !== "ready" || saving.current) return;

        try {
            const sets = toSets(state.values);
            if (JSON.stringify(sets) === JSON.stringify(toSets(state.original))) {
                onClose();
                return;
            }
            saving.current = true;
            setIsSaving(true);
            setError(null);
            await save(target, sets);
            onClose();
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : "No pudimos guardar las series.");
        } finally {
            saving.current = false;
            setIsSaving(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} aria-labelledby={titleId} aria-busy={state.status === "loading" || isSaving} className="space-y-3">
            <h3 id={titleId} className="sr-only">Series de {name}</h3>
            {record && (
                <p className="text-sm text-gray-600">Mejor marca {record.weight} kg × {record.reps} reps</p>
            )}
            {notes && <p className="text-sm text-gray-600">{notes}</p>}
            {state.status === "loading" && <p role="status" className="text-sm text-gray-600">Cargando series…</p>}
            {state.status === "failed" && <p role="alert" className="text-sm text-red-700">{state.message}</p>}
            {state.status === "ready" && (
                <fieldset disabled={isSaving}>
                    <legend className="sr-only">Repeticiones y kilos por serie</legend>
                    <SetRows
                        values={state.values}
                        onChange={(index, field, value) => {
                            const values = state.values.map((row, i) => i === index ? { ...row, [field]: value } : row);
                            setState({ ...state, values });
                            setError(null);
                        }}
                        showEffort={false}
                    />
                </fieldset>
            )}
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            <div className="editor-actions">
                <button type="button" onClick={onClose} disabled={isSaving} className="disabled:opacity-50">
                    Cancelar
                </button>
                {state.status === "failed" && (
                    <button
                        type="button"
                        onClick={() => {
                            setState({ status: "loading" });
                            setAttempt((previous) => previous + 1);
                        }}
                        className="save-sets"
                    >
                        Reintentar
                    </button>
                )}
                {state.status === "ready" && (
                    <button type="submit" disabled={isSaving} className="save-sets disabled:opacity-50">
                        {isSaving ? "Guardando…" : "Guardar series"}
                    </button>
                )}
            </div>
        </form>
    );
}
