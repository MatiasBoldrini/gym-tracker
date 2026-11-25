import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { StrengthHistory } from "./StrengthHistory";
import { StrengthExercisePicker } from "./StrengthExercisePicker";
import { movementNames } from "./strength";
import { FatigaScreen } from "@/components/screens/FatigaScreen";
import { ActivationExercises } from "./ActivationExercises";
import { RatingStars } from "./RatingStars";
import { RoutineSelector } from "./RoutineSelector";
import { MUSCLE_ALIASES, parseSeriesCount } from "@/lib/fatiga";
import { normalizeExerciseKey, normalizeMuscleKey } from "@/lib/normalize";
import {
    blockLabel, numberFormat, sessionKey,
    type Block, type Day, type Routine, type Week, type WorkoutLog,
} from "./routine";

type BlockLibraryProps = {
    section: "historial" | "progreso" | "referencias" | "rpe" | "fatiga";
    routine: Routine;
    log: WorkoutLog;
    week?: Week | null;
    onOpen: (block: Block, week: Week, day: Day) => void;
};

const dateFormat = new Intl.DateTimeFormat("es-AR", {
    day: "numeric", month: "short", year: "numeric",
});

const panelHeadingClass = "border-b border-black/5 py-3 text-sm font-bold";
const emptyClass = "py-4 text-sm text-black/60";

function History({ routine, log, onOpen }: Pick<BlockLibraryProps, "routine" | "log" | "onOpen">) {
    const entries = routine.blocks.flatMap(block => block.weeks.flatMap(week => week.days.flatMap(day => {
        const key = sessionKey(block, week, day);
        const workout = log[key];
        if (!workout && day.rating === null && !day.note.trim()) return [];

        const timestamp = Date.parse(workout?.startedAt ?? "");
        return [{ key, block, week, day, workout, startedAt: Number.isFinite(timestamp) ? timestamp : null }];
    }))).reverse();
    // Undated sessions keep the reverse order of the plan after the dated sessions.
    entries.sort((a, b) => (b.startedAt ?? Number.MIN_SAFE_INTEGER) - (a.startedAt ?? Number.MIN_SAFE_INTEGER));

    return (
        <section className="ruled-section" aria-label="Sesiones">
            {entries.length ? <ul className="divide-y divide-black/5">
                {entries.map(({ key, block, week, day, workout, startedAt }) => {
                    const rating = workout ? workout.rating : day.rating;
                    const notes = [...new Set([day.note.trim(), workout?.note.trim()].filter(Boolean))].join("\n");
                    const inProgress = workout && !workout.finishedAt;
                    return (
                        <li key={key}>
                            <button type="button" onClick={() => onOpen(block, week, day)}
                                className="flex w-full items-center gap-3 py-3 text-left active:bg-black/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ios-blue">
                                <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-bold">Semana {week.number} · Día {day.number}</span>
                                    <span className="block text-xs text-black/60">{blockLabel(block)}</span>
                                    {(startedAt !== null || inProgress) && <span className="mt-1 block text-sm text-black/70">
                                        {startedAt !== null && <time dateTime={workout.startedAt}>{dateFormat.format(startedAt)}</time>}
                                        {startedAt !== null && inProgress && " · "}{inProgress && "En curso"}
                                    </span>}
                                    {notes && <span className="mt-1 block whitespace-pre-line wrap-break-word text-sm text-black/70">{notes}</span>}
                                </span>
                                {rating != null && <RatingStars value={rating} compact />}
                                <ChevronRight size={16} className="shrink-0 text-black/45" aria-hidden="true" />
                            </button>
                        </li>
                    );
                })}
            </ul> : <p className={emptyClass}>Todavía no hay sesiones registradas.</p>}
        </section>
    );
}

function Progress({ routine, log }: Pick<BlockLibraryProps, "routine" | "log">) {
    const names = useMemo(() => movementNames(routine), [routine]);
    const [selectedName, setSelectedName] = useState("Squat comp");
    const current = names.includes(selectedName) ? selectedName : names[0];
    if (!current) return <p className={emptyClass}>Esta rutina todavía no tiene ejercicios.</p>;
    return <>
        <StrengthExercisePicker names={names} catalog={routine.catalog} value={current} onChange={setSelectedName} />
        <StrengthHistory routine={routine} log={log} name={current} showHeading={false} />
    </>;
}

function References({ routine, showRpe }: Pick<BlockLibraryProps, "routine"> & { showRpe: boolean }) {
    return (
        <>
            {!showRpe && <ActivationExercises groups={routine.activation} />}
            {showRpe && <section className="ruled-section">
                <h2 id="bloques-rpe-heading" className={panelHeadingClass}>Porcentaje del 1RM</h2>
                {routine.rpe.rows.length > 0 ? (
                    <div className="overflow-x-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ios-blue"
                        role="region" tabIndex={0} aria-labelledby="bloques-rpe-heading">
                        <table className="w-full border-separate border-spacing-0 text-center text-xs tabular-nums">
                            <thead>
                                <tr>
                                    <th scope="col" className="sticky left-0 z-10 whitespace-nowrap bg-inset px-3 py-3">Reps / RPE</th>
                                    {routine.rpe.columns.map(value => (
                                        <th scope="col" key={value} className="min-w-12 bg-inset px-2 py-3">{numberFormat.format(value)}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {routine.rpe.rows.map(([reps, ...values]) => <tr key={reps}>
                                    <th scope="row" className="sticky left-0 border-t border-black/5 bg-canvas px-3 py-3">{reps}</th>
                                    {values.map((value, index) => (
                                        <td key={routine.rpe.columns[index]} className="border-t border-black/5 px-2 py-3">{numberFormat.format(value * 100)}%</td>
                                    ))}
                                </tr>)}
                            </tbody>
                        </table>
                    </div>
                ) : <p className="py-4 text-sm text-black/60">No hay una tabla RPE en esta rutina.</p>}
            </section>}
        </>
    );
}

function Fatigue({ routine, week: trainingWeek }: Pick<BlockLibraryProps, "routine" | "week">) {
    const [params, setParams] = useSearchParams();
    const block = routine.blocks.find(item => item.id === params.get("hoja"))
        ?? routine.blocks.find(item => trainingWeek && item.weeks.includes(trainingWeek)) ?? routine.blocks[0];
    const week = block.weeks.find(item => item.number === Number(params.get("semana") ?? trainingWeek?.number)) ?? block.weeks[0];
    function choose(sheet: Block, nextWeek?: Week) {
        const next = new URLSearchParams(params);
        next.set("hoja", sheet.id);
        next.set("semana", String((nextWeek ?? sheet.weeks.find(item => item.number === week.number) ?? sheet.weeks[0]).number));
        setParams(next, { replace: true });
    }
    const muscleByExercise = new Map(routine.catalog.map(exercise => [normalizeExerciseKey(exercise.name), exercise.muscle]));
    const muscles = new Map<string, { label: string; counts: Map<number, number> }>();
    const daySummary = week.days.map(day => {
        let series = 0;
        for (const exercise of day.exercises) {
            const prescribed = parseSeriesCount(exercise.prescription.replaceAll("×", "x"));
            series += prescribed;
            const muscle = muscleByExercise.get(normalizeExerciseKey(exercise.name));
            if (!muscle || !prescribed) continue;
            const normalized = normalizeMuscleKey(muscle);
            const key = MUSCLE_ALIASES[normalized] ?? normalized;
            const value = muscles.get(key) ?? { label: muscle, counts: new Map<number, number>() };
            value.counts.set(day.number, (value.counts.get(day.number) ?? 0) + prescribed);
            muscles.set(key, value);
        }
        return { day: `Día ${day.number}`, avgStars: day.rating, series: series || null };
    });
    const muscleRows = Array.from(muscles, ([key, { label, counts }]) => ({
        key, muscle: label, series: Array.from(counts.values()).reduce((total, series) => total + series, 0),
        frequency: counts.size, calendar: week.days.map(day => counts.get(day.number) ?? null),
    }));
    return (
        <>
            <RoutineSelector blocks={routine.blocks} block={block} week={week} choose={choose} />
            <FatigaScreen embedded muscleRows={muscleRows} daySummary={daySummary}
                calendarDays={daySummary.map(day => day.day)} />
        </>
    );
}

export function BlockLibrary({ section, routine, log, week, onOpen }: BlockLibraryProps) {
    if (section === "fatiga") return <div className="fatigue-view min-w-0"><Fatigue routine={routine} week={week} /></div>;

    return (
        <div className="library-content min-w-0 space-y-4 pt-4 pb-10">
            {section === "historial" && <History routine={routine} log={log} onOpen={onOpen} />}
            {section === "progreso" && <Progress routine={routine} log={log} />}
            {(section === "referencias" || section === "rpe") && <References routine={routine} showRpe={section === "rpe"} />}
        </div>
    );
}
