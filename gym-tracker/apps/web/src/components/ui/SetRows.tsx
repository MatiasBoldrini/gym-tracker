import { useId, useState, type ComponentProps } from "react";
import { Check } from "lucide-react";
import { isTimed, setInputState } from "@/lib/setInput";

export type SetRow = { reps: string; kg: string; effort: string };
type Field = keyof SetRow;
type Props = {
    values: SetRow[];
    onChange: (index: number, field: Field, value: string) => void;
    exercise?: { prescription: string };
    invalidIndex?: number;
    completion?: { checked: boolean[]; toggle: (index: number, checked: boolean) => void };
    showEffort?: boolean;
};

function replacement(input: HTMLInputElement, text: string) {
    return input.value.slice(0, input.selectionStart ?? 0) + text + input.value.slice(input.selectionEnd ?? input.value.length);
}

export function SetRows({ values, onChange, exercise, showEffort = false, invalidIndex, completion }: Props) {
    const timed = exercise && isTimed(exercise);
    const repsLabel = timed ? "Tiempo" : "Reps";
    const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
    const [notice, setNotice] = useState("");
    const id = useId();
    const hints = {
        reps: timed ? "Ingresá un tiempo, por ejemplo 30 s o 0:45." : "Ingresá una cantidad válida de repeticiones.",
        kg: "Usá un número para la carga, por ejemplo 72,5.",
        effort: "Ingresá un esfuerzo de 0 a 10, por ejemplo @8 o RIR 2.",
    };
    const fields: Field[] = showEffort ? ["reps", "kg", "effort"] : ["reps", "kg"];
    function showError(field: Field, index: number) {
        const value = values[index][field];
        const state = setInputState(field, value, exercise);
        if (state === "invalid") return true; // A previously saved value can be replaced in place.
        if (state === "partial") return invalidIndex === index || touched.has(index + field);
        return invalidIndex === index && field === "reps" && !value;
    }

    function inputProps(field: Field, index: number): ComponentProps<"input"> {
        const value = values[index][field];
        const invalid = showError(field, index);
        const label = { reps: repsLabel, kg: "Carga", effort: "Esfuerzo" }[field];
        return {
            type: "text", "aria-label": label + ", serie " + (index + 1),
            inputMode: field === "kg" ? "decimal" : field === "reps" && !timed ? "numeric" : "text",
            autoComplete: "off", autoCorrect: "off", autoCapitalize: "none", spellCheck: false,
            "aria-invalid": invalid || undefined, "aria-describedby": invalid ? id + field : undefined,
            value,
            onFocus: event => {
                if (field === "reps" || invalid) event.currentTarget.select();
                setNotice("");
                if (touched.has(index + field)) setTouched(previous => {
                    const next = new Set(previous);
                    next.delete(index + field);
                    return next;
                });
            },
            onBlur: () => {
                if (setInputState(field, value, exercise) === "partial") setTouched(previous => new Set(previous).add(index + field));
            },
            onPaste: event => {
                const text = event.clipboardData.getData("text/plain");
                const multi = /[\t\r\n]/.test(text);
                if (multi || setInputState(field, replacement(event.currentTarget, text), exercise) !== "complete") {
                    event.preventDefault();
                    setNotice(multi ? "Pegá un solo valor por campo." : hints[field]);
                }
            },
            onBeforeInput: event => {
                const text = event.data;
                if (text && setInputState(field, replacement(event.currentTarget, text), exercise) === "invalid") event.preventDefault();
            },
            onChange: event => {
                const next = event.currentTarget.value;
                // Also covers autofill, dictation, drag-and-drop and non-cancelable input events.
                if (setInputState(field, next, exercise) === "invalid") return;
                setNotice("");
                onChange(index, field, next);
            },
        };
    }

    return <div className={completion ? "set-rows set-checklist" : "set-rows"}>
        <table><caption className="sr-only">Registro de series</caption>
            <thead><tr>{completion && <th scope="col"><span className="sr-only">Serie completada</span></th>}<th scope="col">{repsLabel}</th>
                <th scope="col">Kg</th>{showEffort && <th scope="col">RPE/RIR</th>}</tr></thead>
            <tbody>{values.map((_, index) => <tr key={index}>
                {completion && <th scope="row"><label className="set-toggle" title={completion.checked[index] ? "Desmarcar serie" : "Completar serie"}>
                    <input type="checkbox" checked={completion.checked[index]}
                        onChange={event => completion.toggle(index, event.target.checked)} />
                    <span className="completion-mark" aria-hidden="true"><Check size={14} strokeWidth={3} /></span>
                    <span className="sr-only">Serie {index + 1} hecha</span>
                </label></th>}
                <td><input className="set-reps-input" {...inputProps("reps", index)} /></td>
                <td><input placeholder={completion ? "—" : undefined} {...inputProps("kg", index)} /></td>
                {showEffort && <td><input {...inputProps("effort", index)} /></td>}
            </tr>)}</tbody>
        </table>
        {notice && <p role="status" className="form-error">{notice}</p>}
        {fields.filter(field => values.some((_, i) => showError(field, i))).map(field =>
            <p key={field} id={id + field} className="form-error">{hints[field]}</p>)}
    </div>;
}
