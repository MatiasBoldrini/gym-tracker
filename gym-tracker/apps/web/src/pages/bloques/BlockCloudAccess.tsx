import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { forgetAccess, lookupAccess, recentTemplates, rememberAccess, rememberedAccess, type PlanAccess } from "./planLink";
import { ChangeTemplate, type SwitchTemplate } from "./TemplateActions";

type Result = { token: string; access?: PlanAccess; message?: string; retry?: boolean };
const invalid = "Este enlace ya no está activo. Pedile a quien te compartió la rutina su enlace actual.";

type ActiveTemplateProps = { access: PlanAccess; onRevoked: () => void; switchTo: SwitchTemplate };

export function BlockCloudAccess({ content: Content }: { content: ComponentType<ActiveTemplateProps> }) {
    const location = useLocation();
    const navigate = useNavigate();
    const supplied = new URLSearchParams(location.hash.slice(1)).get("rutina");
    const [saved, setSaved] = useState(rememberedAccess);
    const [result, setResult] = useState<Result>();
    const [attempt, setAttempt] = useState(0);
    const [changing, setChanging] = useState(false);
    const verified = useRef<PlanAccess | null>(null);
    const activate = useCallback((access: PlanAccess) => {
        verified.current = access;
        rememberAccess(access);
        setSaved(access);
        setResult({ token: access.token, access });
    }, []);
    const token = supplied ?? saved?.token;
    const revoke = useCallback(() => {
        if (!token) return;
        verified.current = null;
        forgetAccess(token);
        setResult({ token, message: invalid });
        setSaved(null);
    }, [token]);

    const switchTo: SwitchTemplate = async (candidate, signal) => {
        let access: PlanAccess | null;
        if (!navigator.onLine) {
            access = recentTemplates().find(entry => entry.token === candidate) ?? null;
            if (!access) throw new Error("Conectate a internet para abrir esta plantilla por primera vez.");
        } else {
            try { access = await lookupAccess(candidate, signal); }
            catch { throw new Error("No se pudo verificar el enlace. Revisá la conexión y volvé a intentar."); }
        }
        if (signal.aborted) return;
        if (!access) { forgetAccess(candidate); throw new Error(invalid); }
        activate(access);
        setChanging(false);
        if (supplied) void navigate("/bloques", { replace: true });
    };

    useEffect(() => {
        if (!token || verified.current?.token === token) return;
        verified.current = null;
        const controller = new AbortController();
        async function open(candidate: string) {
            if (!/^[0-9a-f]{64}$/.test(candidate)) { setResult({ token: candidate, message: invalid }); return; }
            const remembered = rememberedAccess();
            const cached = remembered?.token === candidate ? remembered : undefined;
            if (!navigator.onLine && cached) { activate(cached); return; }
            try {
                const access = await lookupAccess(candidate, controller.signal);
                if (controller.signal.aborted) return;
                if (!access) { revoke(); return; }
                activate(access);
            } catch {
                if (controller.signal.aborted) return;
                if (cached) activate(cached);
                else setResult({ token: candidate, retry: true, message: "Conectate a internet para abrir esta rutina por primera vez." });
            }
        }
        void open(token);
        return () => controller.abort();
    }, [token, attempt, revoke, activate]);

    useEffect(() => {
        if (supplied && result?.token === supplied && result.access) {
            void navigate({ pathname: location.pathname, search: location.search, hash: "" }, { replace: true });
        }
    }, [supplied, result, navigate, location.pathname, location.search]);

    if (token && result?.token === token && result.access) return <Content key={token} access={result.access} onRevoked={revoke} switchTo={switchTo} />;
    const problem = (!token || result?.token === token) && result?.message;
    return <main className="mx-auto max-w-sm px-5 pt-[max(12vh,3rem)]">
        <h1 className="mb-3 text-2xl font-bold">Tu rutina</h1>
        <p role="status">{problem || (token ? "Abriendo tu rutina…" : "Abrí el enlace que te compartió quien armó tu plan.")}</p>
        {result?.retry && result.token === token && <button className="mt-3 min-h-11 font-semibold text-ios-blue" onClick={() => setAttempt(n => n + 1)}>Volver a intentar</button>}
        {(!token || problem) && <button type="button" className="mt-3 min-h-11 font-semibold text-ios-blue" aria-haspopup="dialog"
            onClick={() => setChanging(true)}>{token ? "Abrir otra plantilla" : "Abrir plantilla"}</button>}
        {changing && <ChangeTemplate switchTo={switchTo} close={() => setChanging(false)} />}
    </main>;
}
