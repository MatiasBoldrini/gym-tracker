import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft } from "lucide-react";
import bodyPartsUrl from "./body.glb?url";
import { createBodyRenderer, overview, type BodyView } from "./bodyRenderer";
import { volumeColor, type ZoneVolume } from "./zones";

type Props = {
    zones: ZoneVolume[];
    selected: number | null;
    calendarDays: string[];
    weeklySeries: number | null;
    onSelect: (id: number | null) => void;
};
export function FatigueBody({ zones, selected, calendarDays, weeklySeries, onSelect }: Props) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const renderer = useRef<ReturnType<typeof createBodyRenderer> | null>(null);
    const palette = useRef<string[]>([]);
    const activeZone = useRef<number | null>(null);
    const camera = useRef<BodyView>(overview);
    const overviewYaw = useRef(overview.yaw);
    const drag = useRef<{ id: number; x: number; y: number; origin: number; moved: boolean } | null>(null);
    const frame = useRef(0);
    const turning = useRef(0);
    const [degrees, setDegrees] = useState(overview.yaw);
    const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
    const redraw = useCallback(() => {
        if (frame.current) return;
        frame.current = requestAnimationFrame(() => {
            frame.current = 0;
            renderer.current?.draw(camera.current, palette.current, activeZone.current);
        });
    }, []);
    const rotate = useCallback((next: number) => {
        cancelAnimationFrame(turning.current);
        camera.current = { ...camera.current, yaw: next };
        if (selected === null) overviewYaw.current = next;
        setDegrees(Math.round(next));
        redraw();
    }, [redraw, selected]);
    useEffect(() => {
        const colors = ["#e5dfd4"];
        zones.forEach(zone => {
            // Deepen the neutral shade so a zero-volume group is visible when selected.
            colors[zone.id] = zone.id === selected && zone.series === 0 ? "#837c72" : volumeColor(zone.series);
        });
        palette.current = colors;
        activeZone.current = selected !== null && selected <= 7 ? selected : null;
        redraw();
    }, [zones, selected, redraw]);

    useEffect(() => {
        if (state !== "ready" || !renderer.current) return;
        const start = camera.current;
        const target = selected !== null && selected <= 7
            ? renderer.current.focusView(selected, start.yaw) : { ...overview, yaw: overviewYaw.current };
        const delta = (target.yaw - start.yaw + 540) % 360 - 180;
        const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
        const finish = () => {
            cancelAnimationFrame(turning.current);
            camera.current = target;
            setDegrees(Math.round(target.yaw));
            redraw();
        };
        if (motion.matches || (delta === 0 && start.spanX === target.spanX && start.spanY === target.spanY
            && start.centerY === target.centerY && start.centerZ === target.centerZ)) {
            finish();
            return;
        }
        const begin = performance.now();
        function travel(now: number) {
            const t = Math.min(1, (now - begin) / 460);
            if (t === 1) { finish(); return; }
            const ease = t * t * (3 - 2 * t);
            const mix = (from: number, to: number) => from + (to - from) * ease;
            camera.current = {
                yaw: (start.yaw + delta * ease + 360) % 360,
                centerY: mix(start.centerY, target.centerY), centerZ: mix(start.centerZ, target.centerZ),
                spanX: mix(start.spanX, target.spanX), spanY: mix(start.spanY, target.spanY),
            };
            renderer.current?.draw(camera.current, palette.current, activeZone.current);
            turning.current = requestAnimationFrame(travel);
        }
        const reduce = () => { if (motion.matches) finish(); };
        motion.addEventListener("change", reduce);
        turning.current = requestAnimationFrame(travel);
        return () => {
            motion.removeEventListener("change", reduce);
            cancelAnimationFrame(turning.current);
        };
    }, [selected, state, redraw]);

    useEffect(() => {
        const surface = canvas.current;
        if (!surface) return;
        const controller = new AbortController();
        let mesh: ArrayBuffer | undefined;
        const size = () => {
            const ratio = Math.min(window.devicePixelRatio || 1, 2);
            const width = Math.round(surface.clientWidth * ratio);
            const height = Math.round(surface.clientHeight * ratio);
            if (width && height && (surface.width !== width || surface.height !== height)) {
                surface.width = width;
                surface.height = height;
            }
            redraw();
        };
        const init = () => {
            if (!mesh || controller.signal.aborted) return;
            try {
                renderer.current = createBodyRenderer(surface, mesh);
                size();
                setState("ready");
            } catch { setState("missing"); }
        };
        const lost = (event: Event) => {
            event.preventDefault();
            renderer.current?.dispose();
            renderer.current = null;
            setState("missing");
        };
        const observer = new ResizeObserver(size);
        observer.observe(surface);
        surface.addEventListener("webglcontextlost", lost);
        surface.addEventListener("webglcontextrestored", init);
        void fetch(bodyPartsUrl, { signal: controller.signal }).then(response => {
            if (!response.ok) throw new Error("No se pudo cargar la figura");
            return response.arrayBuffer();
        }).then(file => {
            mesh = file;
            init();
        }).catch(() => { if (!controller.signal.aborted) setState("missing"); });
        return () => {
            controller.abort();
            observer.disconnect();
            surface.removeEventListener("webglcontextlost", lost);
            surface.removeEventListener("webglcontextrestored", init);
            cancelAnimationFrame(frame.current);
            frame.current = 0;
            renderer.current?.dispose();
            renderer.current = null;
        };
    }, [redraw]);

    const selection = zones.find(zone => zone.id === selected);
    const series = selection ? selection.series : weeklySeries;
    return <figure className="fatigue-figure" aria-label="Trabajo semanal por grupo muscular">
        <div className="fatigue-stage" data-state={state} data-focused={selected !== null && selected <= 7}>
            <div className="fatigue-readout">
                <div role="status" aria-atomic="true">
                    <p className="fatigue-kicker">{selection ? "Grupo muscular" : "Trabajo semanal"}</p>
                    {selection && <h3 className="fatigue-group-name">{selection.name}</h3>}
                    {series !== null
                        ? <p className="fatigue-count"><strong>{series}</strong> {series === 1 ? "serie" : "series"}</p>
                        : <p className="fatigue-empty">Sin datos de volumen</p>}
                    {selection?.id === 8 && <p className="fatigue-hint">Sin zona en el modelo.</p>}
                    {selection && selection.calendar.some(v => v !== null) && <dl className="fatigue-day-split" aria-label="Series por día">
                        {selection.calendar.map((value, i) => value !== null && <div key={i}>
                            <dt>{calendarDays[i]}</dt><dd>{value}</dd>
                        </div>)}
                    </dl>}
                </div>
                {selection ? <button type="button" className="fatigue-reset" onClick={() => onSelect(null)}>
                    <ChevronLeft size={13} aria-hidden="true" />Ver total
                </button> : null}
            </div>
            <div className="fatigue-model">
                <canvas ref={canvas} role={state === "ready" ? "slider" : undefined}
                    aria-hidden={state !== "ready" || undefined} tabIndex={state === "ready" ? 0 : undefined}
                    aria-label="Giro del modelo 3D" aria-valuemin={0} aria-valuemax={360}
                    aria-valuenow={degrees} aria-valuetext={degrees + " grados"}
                    onKeyDown={event => {
                        let next = camera.current.yaw;
                        switch (event.key) {
                            case "Escape": if (selected !== null) { event.preventDefault(); onSelect(null); } return;
                            case "ArrowLeft": case "ArrowDown": next = Math.max(0, next - 15); break;
                            case "ArrowRight": case "ArrowUp": next = Math.min(360, next + 15); break;
                            case "Home": next = 0; break;
                            case "End": next = 360; break;
                            default: return;
                        }
                        event.preventDefault();
                        rotate(next);
                    }} onPointerDown={event => {
                        if (!event.isPrimary || event.button !== 0 || !renderer.current) return;
                        event.currentTarget.setPointerCapture(event.pointerId);
                        drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, origin: camera.current.yaw, moved: false };
                    }} onPointerMove={event => {
                        const gesture = drag.current;
                        if (!gesture || gesture.id !== event.pointerId) return;
                        const dx = event.clientX - gesture.x;
                        if (!gesture.moved && Math.hypot(dx, event.clientY - gesture.y) < 5) return;
                        gesture.moved = true;
                        const next = gesture.origin + dx * 360 / event.currentTarget.clientWidth;
                        rotate((next % 360 + 360) % 360);
                    }} onPointerUp={event => {
                        const gesture = drag.current;
                        if (!gesture || gesture.id !== event.pointerId) return;
                        drag.current = null;
                        if (gesture.moved || !renderer.current) return;
                        if (selected !== null) { onSelect(null); return; }
                        const el = event.currentTarget;
                        const rect = el.getBoundingClientRect();
                        const x = Math.floor((event.clientX - rect.left) * el.width / rect.width);
                        const y = el.height - 1 - Math.floor((event.clientY - rect.top) * el.height / rect.height);
                        onSelect(renderer.current.pick(camera.current, palette.current, activeZone.current, x, y));
                    }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }} />
                {state !== "ready" && <span className="fatigue-notice" role="status">
                    {state === "loading" ? "Cargando figura…" : "Vista 3D no disponible"}
                </span>}
            </div>
        </div>
    </figure>;
}
