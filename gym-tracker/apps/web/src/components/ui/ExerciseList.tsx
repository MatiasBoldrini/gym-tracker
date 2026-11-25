import { Fragment, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "framer-motion";
import { Check, ChevronRight } from "lucide-react";
import { ProgressRing } from "./ProgressRing";
import "./exercise-list.css";

export type ExerciseListRow = {
    id: string; name: string; prescription: string; effort?: string;
    completed: boolean; savingCheck?: boolean; countLabel?: string; progress?: { count: number; target: number };
};

type Props = {
    rows: ExerciseListRow[];
    activeId?: string;
    onSelect: (id: string) => void;
    onToggle?: (id: string, checked: boolean) => void;
    renderEditor?: (id: string) => ReactNode;
    renderMedia?: (row: ExerciseListRow) => ReactNode;
};

function EditorRow({ id, columns, children }: { id: string; columns: number; children: ReactNode }) {
    const present = useIsPresent();
    const reduce = useReducedMotion();
    const panel = useRef<HTMLDivElement>(null);
    const hadFocus = useRef(false);
    useLayoutEffect(() => {
        const focus = document.activeElement;
        // Disabling the submit button or setting inert can move focus to body before this effect.
        if (!present && (panel.current?.contains(focus) || (hadFocus.current && focus === document.body))) {
            document.getElementById(id + "-button")?.focus({ preventScroll: true });
        }
    }, [id, present]);
    return <tr className="editor-row"><td colSpan={columns}>
        <motion.div id={id} ref={panel} inert={!present} className="editor-reveal" onFocusCapture={() => { hadFocus.current = true; }}
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.22, ease: [0.22, 0.8, 0.22, 1] }}>
            <div className="editor-content">{children}</div>
        </motion.div>
    </td></tr>;
}

export function ExerciseList({ rows, activeId, onSelect, onToggle, renderEditor, renderMedia }: Props) {
    const tableId = useId();
    const [editSession, setEditSession] = useState(0);
    function select(id: string) {
        // A reopen can reverse the exit animation before the old draft unmounts.
        if (id !== activeId) setEditSession(session => session + 1);
        onSelect(id);
    }
    const hasEffort = rows.some(row => row.effort !== undefined);
    const columns = 3 + Number(hasEffort);
    return <table className="exercise-list">
        <caption className="sr-only">Ejercicios del día</caption>
        <colgroup>
            <col /><col className="prescription-track" />
            {hasEffort && <col className="effort-track" />}
            <col className="completion-track" />
        </colgroup>
        <thead><tr>
            <th scope="col">Ejercicio</th><th scope="col" className="plan-col">Series</th>
            {hasEffort && <th scope="col" className="effort-col">RPE/RIR</th>}
            <th scope="col" className="check-col"><span className="sr-only">Progreso del ejercicio</span></th>
        </tr></thead>
        <tbody>{rows.map((row, index) => {
            const open = row.id === activeId;
            const editorId = `${tableId}-row-${index}`;
            const identity = `${row.name}, fila ${index + 1}`;
            const progress = row.progress;
            const progressId = progress ? editorId + "-progress" : undefined;
            const mark = progress ? <span className="exercise-ring">
                <ProgressRing percent={100 * progress.count / progress.target}
                    label={row.completed ? "✓" : `${progress.count}/${progress.target}`} />
            </span> : <span className="completion-mark" aria-hidden="true"><Check strokeWidth={3} size={14} /></span>;
            return <Fragment key={row.id}>
                <tr className="entry" data-open={open} data-complete={row.completed} onClick={event => {
                    if (!(event.target as Element).closest("button, label, input, dialog")) select(row.id);
                }}>
                    <th scope="row"><div className="exercise-identity">{renderMedia?.(row)}
                        <button type="button" className="edit-exercise" id={editorId + "-button"} aria-expanded={open}
                        aria-controls={open ? editorId : undefined} aria-label={`Editar ${identity}`} onClick={() => select(row.id)}>
                        <span className="exercise-name">{row.name}<ChevronRight size={14} aria-hidden="true" /></span>
                        <span className="compact-plan">
                            {row.prescription && <span>{row.prescription}</span>}
                            {row.effort && <span>{row.effort}</span>}
                        </span>
                        {row.countLabel && <small>{row.countLabel}</small>}
                    </button></div></th>
                    <td className="plan-col">{row.prescription || "—"}</td>
                    {hasEffort && <td className="effort-col">{row.effort || "—"}</td>}
                    <td className="check-col">{onToggle
                        ? <label><input type="checkbox" aria-label={`Completado: ${identity}`}
                            aria-describedby={progressId} checked={row.completed} disabled={row.savingCheck}
                            onChange={event => onToggle(row.id, event.target.checked)} />{mark}{progress && <span id={progressId} className="sr-only">{progress.count} de {progress.target} series registradas</span>}</label>
                        : <span className="read-only-mark" role="img" aria-label={row.completed ? "Completado" : "Pendiente"}>{mark}</span>}
                    </td>
                </tr>
                <AnimatePresence initial={false}>
                    {open && renderEditor && <EditorRow key={row.id} id={editorId} columns={columns}>
                        <Fragment key={editSession}>{renderEditor(row.id)}</Fragment>
                    </EditorRow>}
                </AnimatePresence>
            </Fragment>;
        })}</tbody>
    </table>;
}
