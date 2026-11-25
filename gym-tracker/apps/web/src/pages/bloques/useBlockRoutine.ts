import { applyEdit, readWorkouts, stageEdit, writeWorkouts } from "./workoutStorage";
import { useCallback, useEffect, useRef, useState } from "react";
import { logStorageKey, parseRoutine, type Block, type Routine, type Day, type ExerciseEdit, type Workout, type WorkoutLog } from "./routine";

const blockKey = "gym-bloques:blocks:v1";
const importKey = "gym-bloques:imported-routine:v1";
function load<T>(key: string, fallback: T): T {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw) as T;
}

export function useBlockRoutine() {
    const [snapshot, setSnapshot] = useState<Routine>();
    const [blocks, setBlocks] = useState<Block[]>([]);
    const [log, setLog] = useState<WorkoutLog>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const refresh = useCallback(() => {
        try {
            const additions = load<Block[]>(blockKey, []);
            const workouts = readWorkouts();
            if (!Array.isArray(additions)) throw new Error();
            setBlocks(additions);
            setLog(workouts);
        } catch {
            setError("No se pudo leer el registro de este navegador.");
        }
    }, []);

    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const flushEdits = useCallback(async () => {
        clearTimeout(timer.current);
        timer.current = undefined;
        try {
            await writeWorkouts();
        } catch { setError("No se pudo actualizar el historial de este navegador."); }
    }, []);

    function editExercise(key: string, day: Day, exerciseId: string, edit: ExerciseEdit) {
        const draft = { key, day, exerciseId, edit };
        try {
            stageEdit(draft);
            setLog(current => applyEdit(current, draft));
            setError("");
            clearTimeout(timer.current);
            timer.current = setTimeout(flushEdits, 450);
        } catch { setError("No se pudo guardar el cambio en este navegador. Revisá el espacio disponible."); }
    }

    useEffect(() => {
        const controller = new AbortController();
        refresh();
        void flushEdits();
        async function init() {
            let cached = false;
            try {
                const saved = load<unknown>(importKey, null);
                if (saved && !controller.signal.aborted) {
                    setSnapshot(parseRoutine(saved));
                    setLoading(false);
                    cached = true;
                }
            } catch { /* A fresh copy can recover a malformed local snapshot. */ }
            try {
                const res = await fetch("/_local/rutina.json", { signal: controller.signal });
                if (res.ok && res.headers.get("content-type")?.includes("application/json")) {
                    const data = parseRoutine(await res.json());
                    if (!controller.signal.aborted) {
                        setSnapshot(data);
                        try { localStorage.setItem(importKey, JSON.stringify(data)); }
                        catch { setError("La rutina está abierta. Falta espacio para guardarla sin conexión."); }
                    }
                }
            } catch {
                if (!controller.signal.aborted && !cached) setError("No se pudo leer la rutina local.");
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }
        void init();
        function sync(event: StorageEvent) {
            if (!event.key || event.key === blockKey || event.key === logStorageKey) refresh();
        }
        const flushPending = () => { if (timer.current !== undefined) void flushEdits(); };
        const onVisibility = () => { if (document.hidden) flushPending(); };
        window.addEventListener("storage", sync);
        document.addEventListener("visibilitychange", onVisibility);
        window.addEventListener("pagehide", flushPending);
        return () => {
            controller.abort();
            flushPending();
            window.removeEventListener("storage", sync);
            document.removeEventListener("visibilitychange", onVisibility);
            window.removeEventListener("pagehide", flushPending);
        };
    }, [refresh, flushEdits]);

    async function importFile(file: File) {
        try {
            const data = parseRoutine(JSON.parse(await file.text()));
            data.properties ??= { title: file.name.replace(/\.json$/i, "").trim() || "Mi rutina" };
            localStorage.setItem(importKey, JSON.stringify(data));
            setSnapshot(data);
            setError("");
        } catch { setError("Revisá el formato del JSON y el espacio disponible."); }
    }
    async function saveWorkout(key: string, initialRating: Day["rating"], update: (entry: Workout) => Workout) {
        try {
            await writeWorkouts({ key, initialRating, update });
            setLog(readWorkouts());
            setError("");
            return true;
        } catch { setError("No se pudo guardar la sesión en este navegador."); return false; }
    }
    const routine = snapshot && { ...snapshot, blocks: [...snapshot.blocks, ...blocks] };
    const sourceId = snapshot?.spreadsheetId ?? JSON.stringify([snapshot?.properties?.title, snapshot?.blocks.map(b => [b.id, b.startDate])]);
    return { routine, sourceId, log, loading, error, importFile, saveWorkout, editExercise };
}
