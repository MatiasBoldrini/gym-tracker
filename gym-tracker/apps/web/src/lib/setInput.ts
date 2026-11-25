import { isTimed, loadValue, validReps } from "../../../../supabase/functions/_shared/block-set-input.mjs";

export { isTimed };

type Prescription = { prescription: string };
type Field = "reps" | "kg" | "effort";
type InputState = "complete" | "partial" | "invalid";

function unitPrefix(text: string, units: string[]) {
    return units.some(unit => unit.startsWith(text.toLowerCase()));
}

function effortState(value: string): InputState {
    if (/^(?:@|r|rp|rpe:?|ri|rir:?)$/i.test(value)) return "partial";
    const match = /^(?:(?:rpe|rir)\s*:?\s*|@\s*)?(\d+(?:[.,]\d*)?|[.,]\d*)(?:\s*[-–]\s*(\d*(?:[.,]\d*)?))?$/i.exec(value);
    if (!match) return "invalid";
    const first = match[1].replace(",", ".");
    const last = match[2]?.replace(",", ".");
    if (Number(first) > 10 || (last !== undefined && Number(last) > 10)) return "invalid";
    if (first.endsWith(".")) return last === undefined ? "partial" : "invalid";
    if (last === "" || last?.endsWith(".")) return "partial";
    if (last !== undefined && Number(last) < Number(first)) return last === "1" ? "partial" : "invalid";
    return "complete";
}

// Incomplete but meaningful values (72, or 0:4) can be resumed after changing cells.
export function setInputState(field: Field, raw: string, exercise?: Prescription): InputState {
    if (raw === "") return "complete";
    if (/[\t\r\n]/.test(raw) || !raw.trim()) return "invalid";
    const value = raw.trim();
    if (field === "effort") return effortState(value);
    if (field === "kg") {
        const kg = loadValue(value);
        if (kg !== null && (exercise || (kg <= 500 && !/kg$/i.test(value)))) return "complete";
        if (/^\d*[.,]$/.test(value) && Number(value.slice(0, -1)) <= (exercise ? Number.MAX_SAFE_INTEGER : 500)) return "partial";
        const unit = /^(.*?)\s*k$/i.exec(value);
        return exercise && unit && loadValue(unit[1]) !== null ? "partial" : "invalid";
    }
    if (!exercise) return /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 500 ? "complete" : "invalid";
    if (validReps(value, exercise)) return "complete";

    const prescribed = exercise.prescription.trim().replace(/^\d+\s*[x×]\s*/i, "");
    if (prescribed.startsWith(value) && validReps(prescribed, exercise)) return "partial";
    const range = /^(\d+)\s*[-–]\s*(\d*)$/.exec(value);
    if (range && Number(range[1]) > 0 && Number.isSafeInteger(Number(range[1])) && Number.isSafeInteger(Number(range[2]))) return "partial";
    const unit = /^(\d+(?:[.,]\d+)?(?:\s*[-–]\s*\d+)?)\s*([a-z/]+)$/i.exec(value);
    const timed = isTimed(exercise);
    const units = timed ? ["s", "seg", "segundo", "segundos", "min", "minuto", "minutos"] : ["rep", "reps", "c/u"];
    if (unit && validReps(unit[1], exercise) && unitPrefix(unit[2], units)) return "partial";
    if (timed && (/^\d+:[0-5]?$/.test(value) || /^\d*[.,]$/.test(value) || /^0(?:[.,]0*)?$/.test(value))) return "partial";
    return "invalid";
}

export function prescriptionInputState(raw: string): InputState {
    if (/[\t\r\n]/.test(raw)) return "invalid";
    const text = raw.trim();
    if (!text) return "partial";
    const match = /^(\d+)\s*[x×]\s*(.*)$/i.exec(text);
    if (match && (!Number.isSafeInteger(Number(match[1])) || Number(match[1]) <= 0)) return "invalid";
    const target = match ? match[2] : text;
    if (!target) return "partial";
    const special = ["al fallo", "amrap"];
    if (special.includes(target.toLowerCase())) return "complete";
    if (unitPrefix(target, special)) return "partial";
    // A custom prescription can describe either repetitions or time. A fixed reference
    // keeps arbitrary text from qualifying as a literal imported from the plan.
    const reps = setInputState("reps", target, { prescription: "" });
    if (reps !== "invalid") return reps;
    return setInputState("reps", target, { prescription: '30"' });
}
