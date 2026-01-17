"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { Day } from "@/types";

type DaySelectorProps = {
    days: Day[];
    selectedIndex: number;
    onSelect: (index: number) => void;
    variant?: "blue" | "black";
    layoutId?: string;
};

export function DaySelector({ days, selectedIndex, onSelect, variant = "blue", layoutId = "day-selector-pill" }: DaySelectorProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const activePointerIdRef = useRef<number | null>(null);

    const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
        setIsDragging(true);
        activePointerIdRef.current = e.pointerId;
        detectSelection(e);
    };

    const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
        if (!isDragging) return;
        detectSelection(e);
    };

    const handlePointerUp = (e: PointerEvent<HTMLDivElement>) => {
        setIsDragging(false);
        if (activePointerIdRef.current === e.pointerId) {
            activePointerIdRef.current = null;
        }
    };

    // IMPORTANTE:
    // Antes usábamos setPointerCapture() para soportar "drag" por los días.
    // Pero si el componente se desmonta/cancela en medio de un gesto (o se pierde el pointerup),
    // puede quedar capturando eventos y bloquear clicks globales (incluida la BottomNav).
    // Para evitarlo, no capturamos el pointer y cortamos el "dragging" con un listener global.
    useEffect(() => {
        if (!isDragging) return;

        const stop = () => {
            setIsDragging(false);
            activePointerIdRef.current = null;
        };

        window.addEventListener("pointerup", stop, { passive: true });
        window.addEventListener("pointercancel", stop, { passive: true });
        window.addEventListener("blur", stop);
        return () => {
            window.removeEventListener("pointerup", stop);
            window.removeEventListener("pointercancel", stop);
            window.removeEventListener("blur", stop);
        };
    }, [isDragging]);

    const detectSelection = (e: PointerEvent<HTMLDivElement>) => {
        // We find the element specifically under the pointer
        // Since we are capturing the pointer on the container, we might need mapped coordinates or look up elements manually if standard hit testing fails.
        // However, elementFromPoint works based on screen coordinates.
        const target = document.elementFromPoint(e.clientX, e.clientY);

        if (!target) return;

        // Find the closest button ancestor or check if target is one of our day buttons
        const button = target.closest('button[data-day-index]');

        if (button && button instanceof HTMLButtonElement) {
            const index = parseInt(button.dataset.dayIndex || "", 10);
            if (!isNaN(index) && index !== selectedIndex) {
                onSelect(index);
            }
        }
    };

    const pillColor = variant === "black" ? "bg-black" : "bg-ios-blue";

    return (
        <div
            ref={containerRef}
            className="relative flex items-center justify-between p-1 bg-[#EEEEEF] rounded-full w-full touch-none select-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp} // Handle cancellation cases
        >
            {days.map((day, idx) => {
                const isSelected = selectedIndex === idx;

                return (
                    <button
                        key={day.id}
                        data-day-index={idx}
                        className={`relative z-10 flex-1 py-2 text-sm font-bold text-center capitalize transition-colors duration-200 outline-none
                            ${isSelected ? "text-white" : "text-gray-400 hover:text-gray-600"}
                        `}
                        onClick={() => onSelect(idx)}
                        tabIndex={-1}
                        type="button"
                    >
                        {/* Text Content */}
                        <span className="relative z-10">Día {day.id}</span>

                        {/* Animated Background Pill */}
                        {isSelected && (
                            <motion.div
                                layoutId={layoutId}
                                className={`absolute inset-0 ${pillColor} rounded-full shadow-[0_2px_8px_rgba(0,0,0,0.15)]`}
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
