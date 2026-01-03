"use client";

import { useMemo, useState } from "react";
import type { PersonalRecord } from "@/types";
import { Search, LineChart } from "lucide-react";

type ProgresoScreenProps = {
    initialPrs: PersonalRecord[];
};

export function ProgresoScreen({ initialPrs }: ProgresoScreenProps) {
    const [query, setQuery] = useState("");
    const [sort, setSort] = useState<"1rm" | "date">("1rm");

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        const base = (initialPrs || []).filter((pr) => !q || pr.exercise.toLowerCase().includes(q));

        const sorted = base.slice().sort((a, b) => {
            if (sort === "1rm") return (b.estimated1RM || 0) - (a.estimated1RM || 0);
            // Orden por fecha (mejor esfuerzo): si no parsea, cae a string compare.
            const da = Date.parse(a.date);
            const db = Date.parse(b.date);
            if (Number.isFinite(da) && Number.isFinite(db)) return db - da;
            return String(b.date || "").localeCompare(String(a.date || ""));
        });

        return sorted;
    }, [initialPrs, query, sort]);

    return (
        <div className="px-5 pt-8 pb-10 relative">
            <header className="mb-6">
                <h1 className="text-3xl font-extrabold tracking-tight">Progreso</h1>
                <p className="text-ios-gray mt-1 text-sm font-medium uppercase tracking-wider">Hoja RM</p>
            </header>

            <div className="ios-card p-4 mb-6 bg-white">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-black/5 flex items-center justify-center text-black/60">
                        <Search size={18} />
                    </div>
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Buscar ejercicio..."
                        className="flex-1 bg-transparent outline-none font-bold placeholder:text-ios-gray/70"
                    />
                    <select
                        value={sort}
                        onChange={(e) => setSort(e.target.value as any)}
                        className="text-xs font-black uppercase tracking-wider bg-black text-white rounded-full px-3 py-2"
                    >
                        <option value="1rm">1RM</option>
                        <option value="date">Fecha</option>
                    </select>
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
                            <div key={`${pr.exercise}-${idx}`} className="p-4 flex items-center justify-between gap-4">
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
                                    <div className="text-right">
                                        <div className="text-[10px] font-black text-ios-gray uppercase">1RM</div>
                                        <div className="text-sm font-black text-black">{Math.round(pr.estimated1RM || 0)}kg</div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}


