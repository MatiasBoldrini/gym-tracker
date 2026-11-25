import { useId } from "react";
import { Play } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { normalizeExerciseKey } from "@/lib/normalize";
import type { ActivationGroup } from "./routine";
import "./activation.css";

type Demonstration = { video: string; title?: string; variant?: string };
const pigeon = { video: "JfhP1lPow58", title: "Paloma dinámica" };
const demonstrations: Partial<Record<string, Demonstration>> = {
    pidgeon: pigeon,
    pigeon,
    "rotacion toracica": { video: "ADeGAWCDjhQ", title: "Rotación torácica", variant: "En cuadrupedia" },
    rockback: { video: "i7-x3LDk2y4", variant: "En cuadrupedia" },
    "dorsiflexion tobillo": { video: "CRgmHELYh3A", title: "Dorsiflexión de tobillo", variant: "Rodilla a la pared" },
    "band pull apart": { video: "kZNeqj-wtE0" },
    "monster walk": { video: "fM9omeyODDM" },
    goblet: { video: "iZEGjbLcNis", title: "Sentadilla goblet", variant: "Con apertura de cadera" },
    "couch stretch": { video: "wZRVagDlVWU" },
    "dorsal stretch": { video: "tsGhhcRZhDQ", title: "Estiramiento dorsal", variant: "Con apoyo en banco" },
    "cobra stretch": { video: "9Z7IO95Np2g" },
    "glute bridge": { video: "R1OXPHRqehw", title: "Puente de glúteos" },
    "buenos dias zercher": { video: "Uu-EhHRdWLg", title: "Buenos días Zercher" },
    "wallsit corto": { video: "4RzQBo6TzR4", title: "Sentadilla isométrica en pared", variant: "A 45°" },
};

const liftNames: Partial<Record<string, string>> = { sq: "Sentadilla", bp: "Banca", dl: "Peso muerto" };

function liftName(group: ActivationGroup) {
    const suffix = /^activaci[oó]n\s+(.+)$/iu.exec(group.name.trim())?.[1];
    return suffix ? liftNames[normalizeExerciseKey(suffix)] ?? suffix : undefined;
}

const hasValue = (text: string) => Boolean(text.trim()) && !/^[-–—]$/.test(text.trim());

function ExerciseRows({ exercises }: Pick<ActivationGroup, "exercises">) {
    if (!exercises.length) return <p className="activation-empty">Este bloque todavía no tiene ejercicios.</p>;
    return <ul className="activation-rows">{exercises.map((exercise, index) => {
        const key = normalizeExerciseKey(exercise.name);
        const demo = demonstrations[key];
        const eachSide = /\s+c\s*\/\s*u\.?$/i;
        const reps = exercise.reps.trim().replace(eachSide, "").replace(/^(\d+)\s*["″]$/, "$1 s");
        const dose = [exercise.sets, reps].filter(hasValue).join(" × ");
        const title = key === "aproximar" ? "Series de aproximación" : demo?.title ?? exercise.name;
        const text = <>
            <span className="activation-name"><strong>{title}</strong>{demo?.variant && <small>{demo.variant}</small>}</span>
            {dose && <span className="activation-dose">{dose}{eachSide.test(exercise.reps.trim()) && <small>por lado</small>}</span>}
        </>;
        return <li key={exercise.name + index}>
            {demo ? <a className="activation-row" href={"https://www.youtube.com/watch?v=" + demo.video}
                target="_blank" rel="noopener noreferrer">
                <span className="activation-preview" aria-hidden="true">
                    <img src={`https://i.ytimg.com/vi/${demo.video}/mq2.jpg`} alt="" width={72} height={48}
                        loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true; }} />
                    <span><Play size={10} fill="currentColor" aria-hidden="true" /></span>
                </span>
                {text}<span className="sr-only">Ver demostración en YouTube (se abre en otra pestaña)</span>
            </a> : <div className="activation-row activation-text-row">{text}</div>}
        </li>;
    })}</ul>;
}

export function ActivationExercises({ groups }: { groups: ActivationGroup[] }) {
    const [params, setParams] = useSearchParams();
    const id = useId();
    const lifts = groups.map((group, index) => ({ group, index, label: liftName(group) })).filter(lift => lift.label);
    const selected = lifts.find(lift => String(lift.index) === params.get("grupo")) ?? lifts[0];

    function choose(index: number) {
        const next = new URLSearchParams(params);
        next.set("grupo", String(index));
        setParams(next, { replace: true, preventScrollReset: true });
    }

    if (!groups.length) return <p className="activation-empty">No hay ejercicios de activación en esta rutina.</p>;
    return <div className="activation-library">{groups.map((group, index) => {
        if (!liftName(group)) {
            const name = /^movilidad (gral\.?|general)$/i.test(group.name.trim()) ? "Movilidad general" : group.name;
            return <section key={group.name + index} aria-labelledby={id + index}>
                <h2 id={id + index}>{name}</h2>
                <ExerciseRows exercises={group.exercises} />
            </section>;
        }
        if (index !== lifts[0].index) return null;
        return <section key={group.name + index} aria-labelledby={id + index}>
            <h2 id={id + index}>{lifts.length === 1 ? "Activación · " + selected.label : "Activación específica"}</h2>
            {lifts.length > 1 && <fieldset className="activation-lifts">
                <legend className="sr-only">Elegir levantamiento</legend>
                {lifts.map(lift => <label key={lift.index}>
                    <input type="radio" name={id} value={lift.index} checked={selected === lift}
                        onChange={() => choose(lift.index)} />
                    <span>{lift.label}</span>
                </label>)}
            </fieldset>}
            <div className="activation-current" key={selected.index}><ExerciseRows exercises={selected.group.exercises} /></div>
        </section>;
    })}</div>;
}
