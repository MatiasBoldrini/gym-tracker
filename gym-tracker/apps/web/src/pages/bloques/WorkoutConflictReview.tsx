import { useId, useState, type FormEvent } from "react";
import type { WorkoutConflict } from "./cloudWorkoutStorage";
import { reconcileWorkout, type Choices, type Difference } from "./reconcileWorkout";
import type { Day } from "./routine";

export function WorkoutConflictReview({ conflict, day, title, resolve }: {
    conflict: WorkoutConflict; day: Day; title: string; resolve: (choices: Choices) => void;
}) {
    const { differences } = reconcileWorkout(conflict.base, conflict.local, conflict.remote.workout, day);
    return <section className="border-y border-black/10 px-5 py-4 text-sm">
        <h2 className="font-semibold">Revisá el registro de {title}</h2>
        <ConflictChoices key={JSON.stringify([conflict.remote.revision, differences])}
            differences={differences} resolve={resolve} />
    </section>;
}

function ConflictChoices({ differences, resolve }: { differences: Difference[]; resolve: (choices: Choices) => void }) {
    const [choices, setChoices] = useState<Choices>({});
    const group = useId();
    function submit(event: FormEvent) {
        event.preventDefault();
        if (differences.every(d => choices[d.id])) resolve(choices);
    }
    return <form onSubmit={submit}>
        {differences.length > 0 && <p className="mt-1">Elegí qué valor conservar para {differences.length === 1 ? "este dato" : "cada dato"}.</p>}
        {differences.map((d, i) => <fieldset key={d.id} className="mt-4">
            <legend className="font-semibold">{d.label}</legend>
            {(["local", "remote"] as const).map(source => <label key={source} className="flex min-h-11 cursor-pointer items-start gap-3 py-2">
                <input type="radio" name={group + i} className="mt-1 accent-ios-blue" checked={choices[d.id] === source}
                    onChange={() => setChoices(current => ({ ...current, [d.id]: source }))} />
                <span className="min-w-0"><span className="block text-xs">{source === "local" ? "Este dispositivo" : "Sincronizado"}</span>
                    <span className="whitespace-pre-wrap [overflow-wrap:anywhere]">{d[source]}</span></span>
            </label>)}
        </fieldset>)}
        <button type="submit" className="min-h-11 text-ios-blue disabled:opacity-50" disabled={differences.some(d => !choices[d.id])}>
            {differences.length ? "Guardar selección" : "Confirmar que coinciden"}
        </button>
    </form>;
}
