import { useEffect, useEffectEvent, useRef, type ReactNode } from "react";
import type { Day, Week } from "./routine";

const swipeThreshold = 64;
const gestureControls = "input, textarea, select, label, a, [contenteditable]:not([contenteditable=false]), dialog, [popover]";

export function DaySwipe({ week, day, onChoose, children }: {
    week: Week; day: Day; onChoose: (day: Day) => void; children: ReactNode;
}) {
    const surfaceRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const dragged = useRef(false);
    const chooseDay = useEffectEvent(onChoose);

    useEffect(() => {
        const surface = surfaceRef.current!;
        const content = contentRef.current!;
        const index = week.days.findIndex(item => item.number === day.number);
        if (index < 0 || week.days.length < 2) return;
        const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
        const adjacent = (distance: number) => week.days[index + Math.sign(distance)];
        let pointer: { id: number; x: number; y: number; horizontal: boolean } | undefined;
        let wheelAxis: "x" | "y" | undefined;
        let wheelDistance = 0;
        let wheelEnd: ReturnType<typeof setTimeout>;

        function pull(distance: number) {
            if (reduceMotion.matches) return;
            const offset = Math.min(Math.abs(distance) * .45, adjacent(distance) ? 48 : 10);
            content.style.translate = Math.sign(distance) * offset + "px";
        }

        function release(distance: number) {
            const next = Math.abs(distance) >= swipeThreshold ? adjacent(distance) : undefined;
            const start = next ? -Math.sign(distance) * 32 + "px" : content.style.translate;
            content.style.translate = "";
            if (start && !reduceMotion.matches) {
                content.animate([{ translate: start }, { translate: "0px" }], { duration: 180, easing: "ease-out" });
            }
            if (next) {
                chooseDay(next);
                const main = surface.closest("main");
                if (main && main.getBoundingClientRect().top < 0) main.scrollIntoView({ block: "start", behavior: "instant" });
            }
        }

        function pointerDown(event: PointerEvent) {
            if (wheelAxis) {
                clearTimeout(wheelEnd);
                wheelAxis = undefined;
                wheelDistance = 0;
                release(0);
            }
            if (!event.isPrimary) {
                pointer = undefined;
                release(0);
                return;
            }
            if (event.pointerType === "mouse" || event.button !== 0 || (event.target as Element).closest(gestureControls)) return;
            // Leave screen-edge swipes to the browser's back/forward gesture.
            if (event.clientX < 20 || event.clientX > window.innerWidth - 20) return;
            pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, horizontal: false };
        }

        function pointerMove(event: PointerEvent) {
            if (!pointer || pointer.id !== event.pointerId) return;
            const dx = event.clientX - pointer.x;
            if (!pointer.horizontal) {
                const dy = Math.abs(event.clientY - pointer.y);
                if (Math.max(Math.abs(dx), dy) < 10) return;
                if (Math.abs(dx) < dy * 1.4) { pointer = undefined; return; }
                pointer.horizontal = true;
                dragged.current = true;
                content.getAnimations().forEach(animation => animation.cancel());
                surface.setPointerCapture(event.pointerId);
            }
            pull(dx);
        }

        function pointerEnd(event: PointerEvent) {
            if (!pointer || pointer.id !== event.pointerId) return;
            if (pointer.horizontal) release(event.type === "pointerup" ? event.clientX - pointer.x : 0);
            pointer = undefined;
        }

        function wheel(event: WheelEvent) {
            if (pointer || event.ctrlKey || (event.target as Element).closest(gestureControls)) return;
            if (!event.deltaX && !event.deltaY) return;
            if (!wheelAxis) {
                wheelAxis = Math.abs(event.deltaX) > Math.abs(event.deltaY) * 1.4 ? "x" : "y";
                if (wheelAxis === "x") content.getAnimations().forEach(animation => animation.cancel());
            }
            if (wheelAxis === "x") {
                event.preventDefault();
                const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? surface.clientWidth : 1;
                wheelDistance += event.deltaX * unit;
                pull(wheelDistance);
            }
            // Count trackpad momentum as part of the same gesture.
            clearTimeout(wheelEnd);
            wheelEnd = setTimeout(() => {
                if (wheelAxis === "x") release(wheelDistance);
                wheelDistance = 0;
                wheelAxis = undefined;
            }, 140);
        }

        const events = new AbortController();
        const options = { signal: events.signal };
        surface.addEventListener("pointerdown", pointerDown, options);
        surface.addEventListener("pointermove", pointerMove, options);
        surface.addEventListener("pointerup", pointerEnd, options);
        surface.addEventListener("pointercancel", pointerEnd, options);
        surface.addEventListener("wheel", wheel, { ...options, passive: false });
        return () => {
            events.abort();
            clearTimeout(wheelEnd);
            content.style.translate = "";
        };
    }, [day, week]);

    return <div className="day-swipe" ref={surfaceRef} onPointerDownCapture={event => {
        if (event.isPrimary) dragged.current = false;
    }} onClickCapture={event => {
        if (dragged.current && event.detail !== 0) { event.preventDefault(); event.stopPropagation(); }
    }}>
        <div ref={contentRef}>{children}</div>
    </div>;
}
