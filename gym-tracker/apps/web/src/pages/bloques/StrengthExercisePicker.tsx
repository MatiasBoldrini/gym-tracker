import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, Dumbbell, Search, X } from "lucide-react";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { normalizeExerciseKey } from "@/lib/normalize";
import { illustrationFor } from "./exercise-image";
import type { Routine } from "./routine";

type Option = { name: string; muscle: string; libraryName?: string; file?: string; search: string };

function Thumbnail({ option }: { option: Option }) {
    return <span className="movement-thumb" aria-hidden="true">{option.file
        ? <img src={"/images/exercises/" + option.file} width={40} height={40} loading="lazy" decoding="async" alt="" />
        : <Dumbbell size={20} />}</span>;
}

function MovementSearch({ options, selected, choose, close }: {
    options: Option[]; selected: string; choose: (name: string) => void; close: () => void;
}) {
    const listId = useId();
    const inputId = useId();
    const [query, setQuery] = useState("");
    const [cursor, setCursor] = useState(-1);
    const terms = normalizeExerciseKey(query).split(" ").filter(Boolean);
    const visible = options.filter(item => terms.every(term => item.search.includes(term)));
    const list = useRef<HTMLUListElement>(null);
    const panel = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const viewport = window.visualViewport;
        if (!viewport) return;
        // iOS leaves the layout viewport tall when the keyboard covers part of the list.
        const resize = () => panel.current?.style.setProperty("--visible-height", viewport.height + "px");
        resize();
        viewport.addEventListener("resize", resize);
        return () => viewport.removeEventListener("resize", resize);
    }, []);
    const active = cursor >= 0 ? cursor : (terms.length && visible.length ? 0 : -1);
    function move(index: number) {
        setCursor(index);
        list.current?.children[index]?.scrollIntoView({ block: "nearest" });
    }
    return <ModalFrame label="Cambiar ejercicio" onClose={close}>
        <div className="movement-backdrop" onClick={event => { if (event.target === event.currentTarget) close(); }}>
            <div ref={panel} className="movement-panel">
                <div className="movement-searchbar">
                    <label htmlFor={inputId}><Search size={19} aria-hidden="true" /><span className="sr-only">Buscar ejercicio o músculo</span></label>
                    <input id={inputId} type="text" role="combobox" aria-autocomplete="list" aria-expanded="true"
                        aria-controls={listId} aria-activedescendant={active >= 0 ? listId + "-" + active : undefined}
                        value={query} autoComplete="off" autoCapitalize="none" spellCheck={false} enterKeyHint="go"
                        placeholder="Buscar ejercicio o músculo" onChange={event => {
                            setQuery(event.target.value); setCursor(-1);
                            if (list.current) list.current.scrollTop = 0;
                        }} onKeyDown={event => {
                            if (event.nativeEvent.isComposing || !visible.length) return;
                            if (event.key === "ArrowDown") { event.preventDefault(); move(Math.min(visible.length - 1, active + 1)); }
                            if (event.key === "ArrowUp") { event.preventDefault(); move(active < 0 ? visible.length - 1 : Math.max(0, active - 1)); }
                            if (event.key === "Enter" && visible[active]) { event.preventDefault(); choose(visible[active].name); }
                        }} />
                    <button className="movement-close" type="button" onClick={close} aria-label="Cerrar buscador"><X size={18} /></button>
                </div>
                <ul id={listId} ref={list} className="movement-options" role="listbox" aria-label="Ejercicios de la rutina">
                    {visible.map((item, i) => <li key={item.name} id={listId + "-" + i} role="option"
                        aria-selected={selected === item.name} data-active={i === active || undefined}
                        onMouseDown={event => event.preventDefault()} onClick={() => choose(item.name)}>
                        <Thumbnail option={item} />
                        <span className="movement-option-name">{item.name}
                            {(item.libraryName || item.muscle) && <small>{[item.libraryName, item.muscle].filter(Boolean).join(" · ")}</small>}
                        </span>
                        {selected === item.name && <Check size={18} aria-hidden="true" />}
                    </li>)}
                </ul>
                <p role="status" className={visible.length ? "sr-only" : "movement-no-match"}>{visible.length
                    ? visible.length + (visible.length === 1 ? " ejercicio" : " ejercicios")
                    : "Sin coincidencias. Probá con otro nombre o músculo."}</p>
            </div>
        </div>
    </ModalFrame>;
}

export function StrengthExercisePicker({ names, catalog, value, onChange }: {
    names: string[]; catalog: Routine["catalog"]; value: string; onChange: (name: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const options = useMemo(() => {
        const muscles = new Map(catalog.map(item => [normalizeExerciseKey(item.name), item.muscle]));
        return names.map(name => {
            const image = illustrationFor(name);
            const key = normalizeExerciseKey(name);
            const muscle = muscles.get(key) || image?.muscle || "";
            const libraryName = normalizeExerciseKey(image?.name) !== key ? image?.name : undefined;
            const search = normalizeExerciseKey([name, muscle, libraryName].join(" "));
            return { name, muscle, libraryName, file: image?.file, search };
        });
    }, [catalog, names]);
    const current = options.find(item => item.name === value)!;
    return <>
        <h2><button type="button" className="movement-trigger" aria-haspopup="dialog" aria-expanded={open}
            onClick={() => setOpen(true)}>
            <Thumbnail option={current} /><span>{value}</span>
            <span className="movement-change"><Search size={16} aria-hidden="true" />Cambiar<span className="sr-only"> ejercicio</span></span>
        </button></h2>
        {open && <MovementSearch options={options} selected={value} close={() => setOpen(false)}
            choose={name => { onChange(name); setOpen(false); }} />}
    </>;
}
