"use client";

import { motion } from "framer-motion";
import { useEffect, useId, useRef, type PointerEvent } from "react";
import type { Day } from "@/types";

type DaySelectorProps = {
    days: Pick<Day, "id">[];
    selectedIndex: number;
    onSelect: (index: number) => void;
    variant?: "blue" | "black";
    layoutId?: string;
};

export function DaySelector({ days, selectedIndex, onSelect, variant = "blue", layoutId }: DaySelectorProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const instance = useId();
    const pointer = useRef<{ id: number; x: number; y: number } | null>(null);
    const dragged = useRef(false);

    function selectAt(event: PointerEvent<HTMLDivElement>) {
        const button = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLButtonElement>("button[data-day-index]");
        if (!button || !containerRef.current?.contains(button)) return;
        const index = Number(button.dataset.dayIndex);
        if (index !== selectedIndex) onSelect(index);
    }

    useEffect(() => {
        const end = () => { pointer.current = null; };
        window.addEventListener("pointerup", end);
        window.addEventListener("pointercancel", end);
        window.addEventListener("blur", end);
        return () => {
            window.removeEventListener("pointerup", end);
            window.removeEventListener("pointercancel", end);
            window.removeEventListener("blur", end);
        };
    }, []);

    const pillColor = variant === "black" ? "bg-black" : "bg-ios-blue";

    return (
        <div
            ref={containerRef}
            className="day-segments relative flex items-center rounded-full w-full select-none"
            role="group" aria-label="Días de entrenamiento"
            onPointerDown={event => {
                if (!event.isPrimary || event.button !== 0) return;
                dragged.current = false;
                pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
            }}
            onPointerMove={event => {
                const start = pointer.current;
                if (!start || start.id !== event.pointerId) return;
                if (!dragged.current) {
                    const dx = Math.abs(event.clientX - start.x);
                    const dy = Math.abs(event.clientY - start.y);
                    if (Math.max(dx, dy) < 7) return;
                    if (dy > dx) { pointer.current = null; return; }
                    dragged.current = true;
                }
                selectAt(event);
            }}
        >
            {days.map((day, idx) => {
                const isSelected = selectedIndex === idx;

                return (
                    <button
                        key={day.id}
                        data-day-index={idx}
                        className={`relative flex-1 py-2 text-sm font-semibold text-center capitalize transition-colors duration-200 focus-visible:outline-ios-blue
                            ${isSelected ? "text-white" : "text-[#5b5b65] hover:text-black"}
                        `}
                        onClick={event => {
                            if ((event.detail === 0 || !dragged.current) && idx !== selectedIndex) onSelect(idx);
                        }}
                        aria-pressed={isSelected}
                        type="button"
                    >
                        <span className="relative z-10">Día {day.id}</span>

                        {isSelected && (
                            <motion.div
                                layoutId={layoutId ?? instance}
                                className={`day-segment-indicator absolute inset-0 ${pillColor} rounded-full shadow-[0_2px_8px_rgba(0,0,0,0.15)]`}
                                transition={{
                                    type: "spring",
                                    stiffness: 350,
                                    damping: 30
                                }}
                            />
                        )}
                    </button>
                );
            })}
        </div>
    );
}
