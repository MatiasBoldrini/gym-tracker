import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Check, ChevronRight, Copy, Pencil, Share, X } from "lucide-react";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { recentTemplates, templateLink, templateSheetLink, templateToken, type PlanAccess } from "./planLink";

export type SwitchTemplate = (token: string, signal: AbortSignal) => Promise<void>;

function TemplateModal({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
    return <ModalFrame label={title} onClose={close}>
        <div className="template-backdrop" onClick={event => { if (event.target === event.currentTarget) close(); }}>
            <section className="template-panel">
                <header><h2>{title}</h2><button type="button" className="template-icon" aria-label="Cerrar" onClick={close}><X size={20} /></button></header>
                {children}
            </section>
        </div>
    </ModalFrame>;
}

export function ChangeTemplate({ current, switchTo, close }: { current?: PlanAccess; switchTo?: SwitchTemplate; close: () => void }) {
    const [entries, setEntries] = useState(() => switchTo ? recentTemplates() : []);
    const [link, setLink] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const pending = useRef<AbortController | null>(null);
    useEffect(() => () => { pending.current?.abort(); }, []);

    async function open(token: string) {
        if (pending.current) return;
        if (token === current?.token) { close(); return; }
        if (!switchTo) { window.location.assign(templateLink(token)); return; }
        const request = new AbortController();
        pending.current = request;
        setBusy(true); setError("");
        try {
            await switchTo(token, request.signal);
            if (!request.signal.aborted) close();
        } catch (failure) {
            if (!request.signal.aborted) {
                setError(failure instanceof Error ? failure.message : "No se pudo abrir la plantilla.");
                setEntries(recentTemplates());
            }
        } finally {
            pending.current = null;
            if (!request.signal.aborted) setBusy(false);
        }
    }

    return <TemplateModal title="Cambiar plantilla" close={close}>
        {entries.length > 0 && <ul className="template-list" aria-label="Plantillas abiertas en esta pestaña">
            {entries.map(entry => <li key={entry.token}><button type="button" disabled={busy} aria-current={entry.token === current?.token || undefined}
                onClick={() => void open(entry.token)}><span>{entry.title}</span>
                {entry.token === current?.token ? <Check size={18} aria-label="Plantilla actual" /> : <ChevronRight size={16} aria-hidden="true" />}</button></li>)}
        </ul>}
        <form onSubmit={event => {
            event.preventDefault();
            try { void open(templateToken(link, entries)); }
            catch (failure) { setError((failure as Error).message); }
        }}>
            <label>Enlace de la plantilla<input type="text" inputMode="url" autoComplete="off" autoCapitalize="none" spellCheck={false}
                value={link} disabled={busy} aria-invalid={error ? true : undefined} aria-describedby={error ? "template-link-error" : undefined} placeholder="Pegá el enlace de entrenamiento"
                onChange={event => { setLink(event.target.value); setError(""); }} /></label>
            {error && <p role="alert" id="template-link-error">{error}</p>}
            <button className="template-primary" type="submit" disabled={busy}>{busy ? "Abriendo…" : "Abrir plantilla"}</button>
        </form>
    </TemplateModal>;
}

function ShareTemplate({ title, appUrl, sheetUrl, close }: { title: string; appUrl?: string; sheetUrl?: string; close: () => void }) {
    const [feedback, setFeedback] = useState("");
    const [manual, setManual] = useState("");
    const manualField = useRef<HTMLInputElement>(null);
    useEffect(() => { if (manual) { manualField.current?.focus(); manualField.current?.select(); } }, [manual]);
    const targets = [
        { label: "Enlace de entrenamiento", detail: "Quien lo recibe puede ver y registrar series.", url: appUrl },
        { label: "Hoja de Google Sheets", detail: "Se abre con los permisos de la hoja.", url: sheetUrl },
    ];
    async function share(url: string, native: boolean) {
        setFeedback(""); setManual("");
        try {
            if (native) { await navigator.share({ title, url }); return; }
            await navigator.clipboard.writeText(url);
            setFeedback("Enlace copiado.");
        } catch (err) {
            if (native && err instanceof Error && err.name === "AbortError") return;
            setManual(url);
        }
    }
    return <TemplateModal title="Compartir plantilla" close={close}>
        {targets.map(({ label, detail, url }) => url && <div className="template-share-row" key={label}>
            <div><strong>{label}</strong><p>{detail}</p></div>
            <button type="button" className="template-icon" aria-label={"Copiar " + label} onClick={() => void share(url, false)}><Copy size={19} /></button>
            {typeof navigator.share === "function" && <button type="button" className="template-icon" aria-label={"Compartir " + label}
                onClick={() => void share(url, true)}><Share size={19} /></button>}
        </div>)}
        {manual && <label>Copiá este enlace<input ref={manualField} value={manual} readOnly onFocus={e => e.currentTarget.select()} /></label>}
        <p role="status" className="template-feedback">{feedback}</p>
    </TemplateModal>;
}

export function TemplateTitle({ title, access, sheetId, switchTo }: { title: string; access?: PlanAccess; sheetId?: string; switchTo?: SwitchTemplate }) {
    const [dialog, setDialog] = useState<"change" | "share">();
    const sheetUrl = templateSheetLink(sheetId);
    function open(event: MouseEvent<HTMLButtonElement>, kind: "share" | "change") {
        // Safari does not focus buttons on tap. Give the native dialog an invoker to restore.
        event.currentTarget.focus({ preventScroll: true });
        setDialog(kind);
    }
    return <>
        <header className="routine-title">
            <h1>{title}</h1>
            <button type="button" className="template-icon" aria-haspopup="dialog" aria-label="Cambiar plantilla" onClick={e => open(e, "change")}><Pencil size={16} /></button>
            {(access || sheetUrl) && <button type="button" className="template-icon share-template-trigger" aria-haspopup="dialog" aria-label="Compartir plantilla"
                onClick={e => open(e, "share")}><Share size={20} /></button>}
        </header>
        {dialog === "change" && <ChangeTemplate current={access} switchTo={switchTo} close={() => setDialog(undefined)} />}
        {dialog === "share" && <ShareTemplate title={title} appUrl={access && templateLink(access.token)} sheetUrl={sheetUrl} close={() => setDialog(undefined)} />}
    </>;
}
