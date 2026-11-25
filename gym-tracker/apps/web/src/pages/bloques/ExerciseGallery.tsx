import { useMemo, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { ChevronRight, Search, X } from "lucide-react";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { normalizeExerciseKey } from "@/lib/normalize";
import { illustrationFor, searchableIllustrations } from "./exercise-image";
import { StrengthHistory } from "./StrengthHistory";
import { movementNames } from "./strength";
import type { Routine, WorkoutLog } from "./routine";

type Illustration = NonNullable<ReturnType<typeof illustrationFor>>;

function ExerciseMedia({ item }: { item: Illustration }) {
    const [failed, setFailed] = useState(false);
    const reduceMotion = useReducedMotion();
    const poster = `/images/exercises/${item.file}`;
    if (item.video && !failed) {
        return <video className="exercise-media" src={item.video} poster={poster}
            width={640} height={640} autoPlay muted playsInline loop={!reduceMotion}
            disablePictureInPicture disableRemotePlayback
            aria-label={`Demostración de ${item.name}`} onError={() => setFailed(true)} />;
    }
    return <>
        <img className="exercise-media" src={poster} width={800} height={800} alt={`Ilustración de ${item.name}`} />
        {failed && <small role="status">El video no se pudo reproducir.</small>}
    </>;
}

function ImageViewer({ item, close }: { item: Illustration; close: () => void }) {
    return <ModalFrame label={item.name} onClose={close}>
        <div className="image-backdrop" onClick={event => { if (event.target === event.currentTarget) close(); }}>
            <figure className="image-sheet">
                <figcaption><div><strong>{item.name}</strong><small>{item.muscle}</small></div>
                    <button type="button" aria-label="Cerrar vista del ejercicio" onClick={close}><X size={20} /></button>
                </figcaption>
                <ExerciseMedia key={item.file} item={item} />
            </figure>
        </div>
    </ModalFrame>;
}

export function ExerciseImageButton({ name }: { name: string }) {
    const [open, setOpen] = useState(false);
    const item = illustrationFor(name);
    if (!item) return null;
    return <>
        <button type="button" className="exercise-image-button" aria-haspopup="dialog"
            aria-label={item.video ? `Ver movimiento de ${name}` : `Ver imagen de ${name}`}
            onClick={() => setOpen(true)}>
            <img src={`/images/exercises/${item.file}`} alt="" width={36} height={36} loading="lazy" decoding="async" />
        </button>
        {open && <ImageViewer item={item} close={() => setOpen(false)} />}
    </>;
}

type LibraryEntry = {
    key: string; name: string; muscle: string; image?: Illustration; search: string; planNames: string[]; movements: string[];
};

function libraryEntries(routine?: Routine) {
    const entries = new Map<string, LibraryEntry>(searchableIllustrations.map(image =>
        [image.file, { key: image.file, name: image.name, muscle: image.muscle, image, search: image.search, planNames: [], movements: [] }]));
    function include(name: string, muscle = "") {
        const image = illustrationFor(name);
        const key = image?.file ?? normalizeExerciseKey(name);
        let entry = entries.get(key);
        if (!entry) {
            entry = { key, name, muscle, search: normalizeExerciseKey(name + " " + muscle), planNames: [], movements: [] };
            entries.set(key, entry);
        } else if (normalizeExerciseKey(name) !== normalizeExerciseKey(entry.name) && !entry.planNames.includes(name)) {
            entry.planNames.push(name);
            entry.search += " " + normalizeExerciseKey(name + " " + muscle);
        }
        return entry;
    }
    for (const { name, muscle } of routine?.catalog ?? []) include(name, muscle);
    for (const name of movementNames(routine)) include(name).movements.push(name);
    return [...entries.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
}

function ExerciseDetail({ item, initialName, routine, log, close }: {
    item: LibraryEntry; initialName?: string; routine?: Routine; log: WorkoutLog; close: () => void;
}) {
    const [variant, setVariant] = useState(initialName ?? item.name);
    const name = item.movements.find(n => normalizeExerciseKey(n) === normalizeExerciseKey(variant)) ?? item.movements[0] ?? item.name;
    return <ModalFrame label={item.name} onClose={close}>
        <div className="image-backdrop" onClick={event => { if (event.target === event.currentTarget) close(); }}>
            <article className="image-sheet exercise-detail">
                <header><div><h2>{item.name}</h2>{item.muscle && <small>{item.muscle}</small>}</div>
                    <button type="button" aria-label="Cerrar ficha" onClick={close}><X size={20} /></button>
                </header>
                <div className="exercise-detail-body">
                    {item.image && <ExerciseMedia item={item.image} />}
                    {item.movements.length > 1 ? <label className="exercise-variant">Variante
                        <select value={name} onChange={event => setVariant(event.target.value)}>
                            {item.movements.map(n => <option key={n}>{n}</option>)}
                        </select>
                    </label> : name !== item.name && <p className="exercise-plan-name">{name}</p>}
                    <StrengthHistory name={name} routine={routine} log={log} />
                </div>
            </article>
        </div>
    </ModalFrame>;
}

export function ExerciseGallery({ routine, log }: { routine?: Routine; log: WorkoutLog }) {
    const entries = useMemo(() => libraryEntries(routine), [routine]);
    const [query, setQuery] = useState("");
    const [selected, setSelected] = useState<{ key: string; initialName?: string }>();
    const current = entries.find(item => item.key === selected?.key);
    const needle = normalizeExerciseKey(query);
    const visible = entries.filter(item => item.search.includes(needle));
    return <section className="exercise-gallery">
        <header>
            <label><Search size={18} aria-hidden="true" />
                <input type="search" aria-label="Buscar ejercicio o músculo" placeholder="Buscar ejercicio o músculo"
                    value={query} onChange={event => setQuery(event.target.value)} />
            </label>
            <p role="status">{visible.length} {visible.length === 1 ? "ejercicio" : "ejercicios"}</p>
        </header>
        <ul aria-label="Catálogo de ejercicios">{visible.map((item, index) => {
            const alias = needle && item.planNames.find(name => normalizeExerciseKey(name).includes(needle));
            return <li key={item.key}><button type="button" aria-haspopup="dialog"
                onClick={() => setSelected({ key: item.key, initialName: alias || item.name })}>
                {item.image && <img src={`/images/exercises/${item.image.file}`} width={60} height={60}
                    loading={index < 6 ? "eager" : "lazy"} decoding="async" alt="" />}
                <span><strong>{alias || item.name}</strong><small>{alias ? item.name + " · " : ""}{item.muscle}</small></span>
                <ChevronRight size={16} aria-hidden="true" />
            </button></li>;
        })}</ul>
        {!visible.length && <p>Probá con otro nombre de ejercicio o músculo.</p>}
        {current && <ExerciseDetail key={current.key} item={current} initialName={selected?.initialName}
            routine={routine} log={log} close={() => setSelected(undefined)} />}
    </section>;
}
