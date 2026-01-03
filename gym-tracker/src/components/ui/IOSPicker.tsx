"use client";

import React from 'react';

interface IOSPickerProps {
    value: { [key: string]: string | number };
    onChange: (value: { [key: string]: string | number }) => void;
    selections: {
        [key: string]: (string | number)[];
    };
}

export const IOSPicker = ({ value, onChange, selections }: IOSPickerProps) => {
    const height = 200;
    const itemHeight = 40;
    const pad = (height - itemHeight) / 2;

    const keys = React.useMemo(() => Object.keys(selections), [selections]);
    const refs = React.useRef<Record<string, HTMLDivElement | null>>({});
    const scrollEndTimers = React.useRef<Record<string, number | null>>({});
    const isProgrammaticScroll = React.useRef<Record<string, boolean>>({});
    const isScrolling = React.useRef<Record<string, boolean>>({});
    const lastScrollTime = React.useRef<Record<string, number>>({});

    const normalizeIndex = React.useCallback((idx: number, length: number) => {
        if (length <= 0) return 0;
        return Math.max(0, Math.min(length - 1, idx));
    }, []);

    const findIndexForValue = React.useCallback((options: (string | number)[], v: string | number) => {
        const exact = options.findIndex((o) => o === v);
        if (exact >= 0) return exact;
        // Fallback: comparar por string (por si vienen números como strings desde afuera)
        const asString = String(v);
        return Math.max(0, options.findIndex((o) => String(o) === asString));
    }, []);

    const scrollToIndex = React.useCallback((key: string, idx: number, behavior: ScrollBehavior) => {
        const el = refs.current[key];
        if (!el) return;
        isProgrammaticScroll.current[key] = true;
        el.scrollTo({ top: idx * itemHeight, behavior });
        window.setTimeout(() => {
            isProgrammaticScroll.current[key] = false;
        }, behavior === "smooth" ? 150 : 0);
    }, [itemHeight]);

    const computeIndexFromScrollTop = React.useCallback((scrollTop: number) => {
        const center = scrollTop + height / 2;
        const raw = (center - pad - itemHeight / 2) / itemHeight;
        return Math.round(raw);
    }, [height, itemHeight, pad]);

    // Mantener el wheel sincronizado si `value` cambia externamente (por ejemplo, al abrir el modal o al tocar botones rápidos).
    React.useEffect(() => {
        for (const key of keys) {
            // No sincronizar mientras el usuario está scrolleando activamente
            if (isScrolling.current[key]) continue;
            const options = selections[key] || [];
            const idx = normalizeIndex(findIndexForValue(options, value[key]), options.length);
            // No animamos para evitar "tirones" al abrir.
            scrollToIndex(key, idx, "auto");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [keys.join("|"), selections, value]);

    return (
        <div
            className="ios-picker-container w-full h-[200px] overflow-hidden relative"
        >
            <div
                className="absolute inset-0 pointer-events-none z-10"
                style={{
                    background: 'linear-gradient(to bottom, rgba(249,250,251,1) 0%, rgba(249,250,251,0) 30%, rgba(249,250,251,0) 70%, rgba(249,250,251,1) 100%)'
                }}
            />
            <div className="grid grid-cols-2 h-[200px]">
                {keys.map((key) => {
                    const options = selections[key] || [];
                    const selectedIdx = normalizeIndex(findIndexForValue(options, value[key]), options.length);

                    return (
                        <div
                            key={key}
                            ref={(el) => {
                                refs.current[key] = el;
                            }}
                            className="h-[200px] overflow-y-scroll no-scrollbar"
                            style={{
                                // Solo lo esencial para inercia máxima en iOS
                                WebkitOverflowScrolling: "touch",
                                overscrollBehavior: "contain",
                            }}
                            onTouchStart={() => {
                                isScrolling.current[key] = true;
                                // Cancelar cualquier timer pendiente al tocar
                                const prev = scrollEndTimers.current[key];
                                if (prev) window.clearTimeout(prev);
                            }}
                            onTouchEnd={() => {
                                // Marcar el fin del touch pero dejar que la inercia continúe
                                lastScrollTime.current[key] = Date.now();
                            }}
                            onScroll={(e) => {
                                if (isProgrammaticScroll.current[key]) return;
                                const el = e.currentTarget;
                                lastScrollTime.current[key] = Date.now();

                                const prev = scrollEndTimers.current[key];
                                if (prev) window.clearTimeout(prev);

                                // Delay más largo para dejar que la inercia corra libremente
                                scrollEndTimers.current[key] = window.setTimeout(() => {
                                    const idx = normalizeIndex(computeIndexFromScrollTop(el.scrollTop), options.length);
                                    const nextVal = options[idx];
                                    // Snap rápido al terminar
                                    scrollToIndex(key, idx, "smooth");
                                    if (nextVal !== undefined) {
                                        onChange({ ...value, [key]: nextVal });
                                    }
                                    isScrolling.current[key] = false;
                                }, 70);
                            }}
                        >
                            {/* Padding superior para centrar el item seleccionado */}
                            <div style={{ height: pad }} />
                            {options.map((option, idx) => {
                                const selected = idx === selectedIdx;
                                return (
                                    <div
                                        key={String(option)}
                                        className={`flex items-center justify-center h-[40px] transition-all duration-75 select-none ${selected ? 'text-black font-black text-2xl scale-110' : 'text-gray-300 font-medium text-lg'}`}
                                    >
                                        {option}
                                    </div>
                                );
                            })}
                            {/* Padding inferior para centrar el item seleccionado */}
                            <div style={{ height: pad }} />
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
