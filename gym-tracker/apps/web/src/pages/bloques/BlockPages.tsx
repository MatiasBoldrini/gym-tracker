import { useEffect, useState } from "react";
import { BookOpen, Home, LineChart } from "lucide-react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { NavigationBar } from "@/components/navigation/BottomNav";
import { BlockLibrary } from "./BlockLibrary";
import { WorkoutConflictReview } from "./WorkoutConflictReview";
import { BlockTraining } from "./BlockTraining";
import { DaySwipe } from "./DaySwipe";
import { TrainingHeader } from "./TrainingHeader";
import { RoutineSelector } from "./RoutineSelector";
import { ExerciseGallery } from "./ExerciseGallery";
import { useBlockRoutine } from "./useBlockRoutine";
import { useCloudRoutine } from "./useCloudRoutine";
import { BlockCloudAccess } from "./BlockCloudAccess";
import { rememberTemplate, type PlanAccess } from "./planLink";
import type { SwitchTemplate } from "./TemplateActions";
import { blockLabel, dayForSession, logStorageKey, sessionKey, type Block, type Week, type Day } from "./routine";
import "./blocks.css";

const effortPreference = "gym-bloques:show-effort:v1";

const progressLinks = [
    { section: "historial", name: "Historial" }, { section: "progreso", name: "Cargas" }, { section: "fatiga", name: "Fatiga" },
];
const libraryLinks = [
    { section: "imagenes", name: "Ejercicios" }, { section: "referencias", name: "Activación" }, { section: "rpe", name: "Tabla RPE" }, { section: "ajustes", name: "Ajustes" },
];
const items = [
    { name: "Rutina", href: "/bloques", icon: Home },
    { name: "Progreso", href: "/bloques/historial", icon: LineChart, pages: progressLinks.map(item => "/bloques/" + item.section) },
    { name: "Biblioteca", href: "/bloques/imagenes", icon: BookOpen, pages: libraryLinks.map(item => "/bloques/" + item.section) },
];

type Data = Omit<ReturnType<typeof useBlockRoutine>, "importFile" | "routine" | "sourceId"> & {
    routine?: ReturnType<typeof useBlockRoutine>["routine"]; sourceId?: string;
    importFile?: ReturnType<typeof useBlockRoutine>["importFile"];
};
type Cloud = ReturnType<typeof useCloudRoutine> & { access: PlanAccess; switchTo: SwitchTemplate };

function LocalBlocks() {
    const data = useBlockRoutine();
    return <RoutinePages data={data} />;
}

function CloudBlocks({ access, onRevoked, switchTo }: { access: PlanAccess; onRevoked: () => void; switchTo: SwitchTemplate }) {
    const data = useCloudRoutine(access, onRevoked);
    const routine = data.routine;
    useEffect(() => {
        if (routine) rememberTemplate({ ...access, title: routine.properties?.title || "Mi rutina", spreadsheetId: routine.spreadsheetId });
    }, [access, routine]);
    return <RoutinePages key={data.sourceId} data={data} cloud={{ ...data, access, switchTo }} />;
}

export default function BlockPages() {
    if (import.meta.env.VITE_BLOCKS_CLOUD === "true") {
        if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY)
            return <p className="p-6" role="alert">Falta configurar la conexión con las rutinas.</p>;
        return <BlockCloudAccess content={CloudBlocks} />;
    }
    return <LocalBlocks />;
}

function RoutinePages({ data, cloud }: { data: Data; cloud?: Cloud }) {
    const { pathname } = useLocation();
    const navigate = useNavigate();
    const section = pathname.split("/")[2] || "rutina";
    const { routine, sourceId, log, loading, error, importFile, saveWorkout, editExercise } = data;
    const selectionKey = cloud ? sourceId + ":selection" : "bloques:selection";
    const [selection, setSelection] = useState(() => {
        try { return (JSON.parse(sessionStorage.getItem(selectionKey) ?? "null") ?? {}) as
            { block?: string; week?: number; day?: number }; } catch { return {}; }
    });
    const effortKey = cloud ? effortPreference + ":" + cloud.access.id : effortPreference;
    const [showEffort, setShowEffort] = useState(() => {
        try { return localStorage.getItem(effortKey) === "true"; } catch { return false; }
    });
    const [preferenceError, setPreferenceError] = useState("");
    const [importResult, setImportResult] = useState("");
    const [hasLegacy] = useState(() => {
        if (!cloud) return false;
        try { return !!localStorage.getItem(logStorageKey); } catch { return false; }
    });
    useEffect(() => {
        function syncPreference(event: StorageEvent) {
            if (event.key === effortKey || event.key === null) setShowEffort(event.newValue === "true");
        }
        window.addEventListener("storage", syncPreference);
        return () => window.removeEventListener("storage", syncPreference);
    }, [effortKey]);
    const block = routine?.blocks.find(b => b.id === selection.block) ?? routine?.blocks.at(-1);
    const week = block?.weeks.find(w => block.id === selection.block && w.number === selection.week) ?? block?.weeks[0];
    const day = week?.days.find(d => block?.id === selection.block && d.number === selection.day) ?? week?.days[0];

    function choose(b: Block, w: Week = b.weeks[0], d: Day = w.days[0]) {
        const next = { block: b.id, week: w.number, day: d.number };
        setSelection(next);
        try { sessionStorage.setItem(selectionKey, JSON.stringify(next)); } catch { /* solo para retomar la vista */ }
    }
    function open(b: Block, w: Week, d: Day) {
        choose(b, w, d);
        navigate("/bloques");
    }

    const key = block && week && day ? sessionKey(block, week, day) : "";
    const links = progressLinks.some(item => item.section === section) ? progressLinks :
        libraryLinks.some(item => item.section === section) ? libraryLinks : null;
    const groupName = links === progressLinks ? "Progreso" : "Biblioteca";
    const hasRoutine = !!(routine && block && week && day);
    const workout = log[key];
    let content;
    if (section === "crear") return <Navigate to="/bloques" replace />;
    if (section === "mas") return <Navigate to="/bloques/imagenes" replace />;
    if (section === "imagenes") content = <ExerciseGallery routine={routine} log={log} />;
    else if (section === "ajustes") content = <section className="library-content pt-4">
        <label className="flex min-h-14 cursor-pointer items-center justify-between gap-4 border-b border-black/10 py-3">
            <span>Mostrar RPE/RIR dentro de los ejercicios</span>
            <input type="checkbox" checked={showEffort} className="size-5 shrink-0 accent-ios-blue" onChange={event => {
                const enabled = event.target.checked;
                setShowEffort(enabled);
                try { localStorage.setItem(effortKey, String(enabled)); setPreferenceError(""); }
                catch { setPreferenceError("El ajuste se aplicó solo para esta visita."); }
            }} />
        </label>
        {cloud && <div className="grid gap-3 border-b border-black/10 py-4 text-sm">
            <p role="status">{cloud.status}</p>
            {hasLegacy && <button className="min-h-11 text-left font-semibold text-ios-blue" type="button" onClick={async () => {
                const total = await cloud.importLegacy();
                if (total !== undefined) setImportResult(total ? `Entrenamientos importados: ${total}.` : "Ya están en tu rutina o pertenecen a otra rutina.");
            }}>Importar mis entrenamientos de este navegador</button>}
            {importResult && <p role="status">{importResult}</p>}

        </div>}
        {preferenceError && <p role="status">{preferenceError}</p>}
    </section>;
    else if (loading) content = <p role="status" className="p-6">Cargando rutina…</p>;
    else if ((!routine || !block) && cloud) content = <section className="p-6">
        <p>{error ? "Tu rutina todavía no está disponible en este dispositivo." : "Todavía no tenés un plan asignado."}</p>
        <button className="mt-2 min-h-11 text-ios-blue" type="button" onClick={cloud.retry}>Volver a consultar</button>
    </section>;
    else if (!routine || !block) content = <section className="p-6 space-y-4">
        {links ? <h2 className="text-xl font-bold">Importar rutina</h2> : <h1>Rutina por bloques</h1>}
        <label className="block border-y border-black/10 py-4 font-semibold">Importá el JSON de la rutina
            <input className="mt-3 block w-full text-sm" type="file" accept=".json,application/json"
                onChange={e => { const file = e.target.files?.[0]; if (file) void importFile?.(file); }} />
        </label>
    </section>;
    else if (section === "rutina" && hasRoutine) content = <DaySwipe week={week} day={day} onChoose={next => choose(block, week, next)}>
        <BlockTraining block={block} week={week} day={day} log={log} showEffort={showEffort}
            editExercise={editExercise} saveWorkout={saveWorkout} />
    </DaySwipe>;
    else if (section === "fatiga" || section === "progreso" || section === "referencias" || section === "rpe" || section === "historial")
        content = <BlockLibrary section={section} routine={routine} log={log} week={week} onOpen={open} />;
    else return <Navigate to="/bloques" replace />;
    return <div className="block-shell min-h-dvh bg-canvas pb-[calc(var(--bottom-nav-base)+env(safe-area-inset-bottom))]">
        <main className="mx-auto w-full max-w-2xl" data-training={section === "rutina" && hasRoutine || undefined}>
            {!loading && section === "rutina" && hasRoutine && <TrainingHeader key={sourceId} access={cloud?.access} sheetId={routine.spreadsheetId} switchTo={cloud?.switchTo} sessionId={key}
                sourceTitle={routine.properties?.title ?? "Mi rutina"} rating={workout ? workout.rating : day.rating}
                onRate={rating => saveWorkout(key, day.rating, w => ({ ...w, rating }))}>
                <RoutineSelector blocks={routine.blocks} block={block} week={week} day={day} choose={choose} />
            </TrainingHeader>}
            {links && <header className="section-heading"><h1>{groupName}</h1>
                <nav aria-label={groupName}>{links.map(link => <Link key={link.section} to={"/bloques/" + link.section}
                    aria-current={section === link.section ? "page" : undefined}>{link.name}</Link>)}</nav>
            </header>}
            {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">{error}</p>}
            {cloud?.offlinePlanUnavailable && <p role="status" className="px-5 py-2 text-sm">No se pudo guardar una copia del plan en este dispositivo para abrirlo sin conexión.</p>}
            {cloud?.sheetProblems.filter(problem => section === "ajustes" || section === "rutina" && (!problem.session_key || problem.session_key === key))
                .map(problem => <p role="status" className="border-y border-black/10 px-5 py-3 text-sm" key={problem.session_key}>
                    {problem.sheet_row ? `Revisá la fila ${problem.sheet_row} de «Registro app». ` : "Revisá la programación en Google Sheets. "}
                    {problem.reason}
                </p>)}
            {cloud?.conflicts.map(conflict => {
                const [id, weekNumber, dayNumber] = JSON.parse(conflict.key) as [string, number, number];
                const b = routine?.blocks.find(item => item.id === id);
                const target = dayForSession(routine, conflict.key);
                const title = (b ? blockLabel(b) : id) + " · Semana " + weekNumber + " · Día " + dayNumber;
                return target ? <WorkoutConflictReview key={conflict.key} day={target} conflict={conflict} title={title}
                    resolve={choices => { void cloud.resolve(conflict, choices); }} /> :
                    <p role="status" key={conflict.key}>El día de {title} ya no aparece en la rutina. Su copia sigue en este dispositivo.</p>;
            })}
            {cloud?.rejected.map(session => {
                const [id, weekNumber, dayNumber] = JSON.parse(session) as [string, number, number];
                const b = routine?.blocks.find(item => item.id === id);
                return <p role="alert" key={session} className="border-y border-black/10 px-5 py-3 text-sm">
                    Revisá los datos de la sesión de {b ? blockLabel(b) : id} · Semana {weekNumber} · Día {dayNumber}.
                    {" "}El servidor rechazó el guardado. Tus cambios siguen en este dispositivo y se vuelven a enviar cuando los editás.
                </p>;
            })}
            {content}
        </main>
        <NavigationBar items={items} />
    </div>;
}
