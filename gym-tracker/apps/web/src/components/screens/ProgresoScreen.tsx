"use client";

import { useMemo, useState } from "react";
import type { PersonalRecord } from "@/types";
import { Search, LineChart, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

type ProgresoScreenProps = {
    initialPrs: PersonalRecord[];
};

export function ProgresoScreen({ initialPrs }: ProgresoScreenProps) {
    const [query, setQuery] = useState("");
    const [selected, setSelected] = useState<PersonalRecord | null>(null);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        const base = (initialPrs || []).filter((pr) => !q || pr.exercise.toLowerCase().includes(q));

        // Orden por fecha (si no parsea, cae a string compare).
        const sorted = base.slice().sort((a, b) => {
            const da = Date.parse(a.date);
            const db = Date.parse(b.date);
            if (Number.isFinite(da) && Number.isFinite(db)) return db - da;
            return String(b.date || "").localeCompare(String(a.date || ""));
        });

        return sorted;
    }, [initialPrs, query]);

    return (
        <div className="px-5 pt-8 pb-10 relative">
            <header className="mb-6">
                <h1 className="text-3xl font-extrabold tracking-tight">Progreso</h1>
                <p className="text-ios-gray mt-1 text-sm font-medium uppercase tracking-wider">Hoja RM</p>
            </header>

            <div className="ios-card p-4 mb-6 bg-white">
                <div className="flex items-center gap-3">
                    {/* En iOS/Safari a veces se deforma si no forzamos un cuadrado real */}
                    <div className="w-10 h-10 aspect-square min-w-10 min-h-10 flex-none rounded-full bg-black/5 flex items-center justify-center text-black/60">
                        <Search size={18} />
                    </div>
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Buscar ejercicio..."
                        className="flex-1 bg-transparent outline-none font-bold placeholder:text-ios-gray/70"
                    />
                </div>
            </div>

            <div className="ios-card overflow-hidden">
                <div className="bg-black px-4 py-4 flex items-center justify-between">
                    <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white">Marcas personales</h2>
                    <LineChart size={16} className="text-white/40" />
                </div>

                {filtered.length === 0 ? (
                    <div className="p-6 bg-white text-ios-gray text-sm">
                        No hay datos para mostrar. Verificá que la hoja <span className="font-bold">RM</span> tenga filas en A:E.
                    </div>
                ) : (
                    <div className="divide-y divide-black/5 bg-white">
                        {filtered.map((pr, idx) => (
                            <button
                                key={`${pr.exercise}-${idx}`}
                                type="button"
                                onClick={() => setSelected(pr)}
                                className="w-full text-left p-4 flex items-center justify-between gap-4 active:bg-black/5 transition-colors"
                            >
                                <div className="min-w-0">
                                    <div className="font-black text-xs uppercase tracking-wider text-black truncate">
                                        {pr.exercise}
                                    </div>
                                    <div className="text-[10px] font-black text-ios-gray uppercase tracking-wider">
                                        {pr.date || "—"}
                                    </div>
                                </div>

                                <div className="flex items-center gap-4 shrink-0">
                                    <div className="text-right">
                                        <div className="text-[10px] font-black text-ios-gray uppercase">PR</div>
                                        <div className="text-sm font-black text-black">
                                            {pr.weight}kg <span className="text-[11px] text-ios-gray">x {pr.reps}</span>
                                        </div>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Mini modal: equivalente en RM (1RM estimado) */}
            <AnimatePresence>
                {selected && (
                    <>
                        <motion.div
                            className="fixed inset-0 z-40 bg-black/20"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setSelected(null)}
                        />

                        <motion.div
                            className="fixed inset-0 z-50 flex items-center justify-center px-6"
                            initial={{ opacity: 0, y: 10, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.98 }}
                            onClick={() => setSelected(null)}
                        >
                            <div
                                className="w-full max-w-xs bg-white rounded-3xl shadow-2xl border border-black/10 overflow-hidden"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="px-5 py-4 flex items-start justify-between gap-4 bg-white">
                                    <div className="min-w-0">
                                        <div className="text-xs font-black uppercase tracking-wider text-ios-gray">Equivalente en RM</div>
                                        <div className="text-base font-black uppercase tracking-tight text-black truncate">{selected.exercise}</div>
                                        <div className="text-[10px] font-black text-ios-gray uppercase tracking-wider">{selected.date || "—"}</div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setSelected(null)}
                                        className="w-9 h-9 aspect-square rounded-full bg-black/5 flex items-center justify-center text-black/60 active:scale-95 transition-transform"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>

                                <div className="px-5 pb-5">
                                    <div className="rounded-2xl bg-black/5 p-4">
                                        <div className="flex items-center justify-between">
                                            <div className="text-[10px] font-black text-ios-gray uppercase tracking-wider">PR</div>
                                            <div className="text-sm font-black text-black">
                                                {selected.weight}kg <span className="text-[11px] text-ios-gray">x {selected.reps}</span>
                                            </div>
                                        </div>
                                        <div className="mt-3 flex items-center justify-between">
                                            <div className="text-[10px] font-black text-ios-gray uppercase tracking-wider">1RM estimado</div>
                                            <div className="text-lg font-black text-black">
                                                {Math.round(selected.estimated1RM || 0)}kg
                                            </div>
                                        </div>
                                        <div className="mt-1 text-[10px] font-bold text-ios-gray">
                                            (No se muestra en la lista; tocá una fila para verlo)
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}


