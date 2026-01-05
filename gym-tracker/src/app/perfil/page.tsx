"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Copy, Check, Loader2, AlertCircle } from "lucide-react";
import { fetchWeekData } from "@/lib/sheets-client";
import { Week } from "@/types";
import { useAuth } from "@/lib/hooks/useAuth";

const ROUTINE_BUILDER_URL =
    "https://gemini.google.com/gem/1h78boD42OJHWVL_adZzOtrEEs-uwERAn?usp=sharing&hl=es_419";

type CopyState = "idle" | "success" | "error";

function buildToonRoutine(week: Week): string {
    const lines: string[] = ["```toon", "SEMANA 1"];

    week?.days?.forEach((day) => {
        const dayTitle = day?.name?.toUpperCase?.() || `DIA ${day?.id ?? ""}`.trim();
        if (dayTitle) lines.push(dayTitle);

        day?.exercises?.forEach((exercise) => {
            const name = (exercise?.name || "").trim();
            const series = (exercise?.prescribedSeries || "").toString().trim() || "-";
            if (!name && series === "-") return;
            lines.push(`${name} | ${series}`);
        });

        lines.push("");
    });

    while (lines.length > 0 && lines[lines.length - 1] === "") {
        lines.pop();
    }

    lines.push("```");
    return lines.join("\n");
}

export default function PerfilPage() {
    const auth = useAuth();
    const [week, setWeek] = useState<Week | null>(null);
    const [isLoadingWeek, setIsLoadingWeek] = useState(false);
    const [copyState, setCopyState] = useState<CopyState>("idle");
    const [copyMessage, setCopyMessage] = useState<string | null>(null);
    const [isCopying, setIsCopying] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    const hasSetup = auth.isSetupComplete;

    const loadWeek = useCallback(async () => {
        if (!hasSetup) return;
        setIsLoadingWeek(true);
        setLoadError(null);
        try {
            const data = await fetchWeekData(1);
            setWeek(data.week);
        } catch (error: any) {
            console.error("Error cargando Semana 1:", error);
            setLoadError("No pudimos leer la Semana 1 de tu sheet.");
        } finally {
            setIsLoadingWeek(false);
        }
    }, [hasSetup]);

    useEffect(() => {
        if (auth.isLoading) return;
        if (!hasSetup) return;
        if (week || isLoadingWeek) return;
        loadWeek();
    }, [auth.isLoading, hasSetup, isLoadingWeek, loadWeek, week]);

    const routinePreview = useMemo(() => {
        if (!week || !week.days?.length) return null;
        return buildToonRoutine(week);
    }, [week]);

    const handleCopyRoutine = async () => {
        if (!hasSetup) {
            setCopyState("error");
            setCopyMessage("Conectá tu cuenta y spreadsheet para copiar la rutina.");
            return;
        }

        setIsCopying(true);
        setCopyState("idle");
        setCopyMessage(null);

        try {
            let currentWeek = week;
            if (!currentWeek) {
                const data = await fetchWeekData(1);
                currentWeek = data.week;
                setWeek(currentWeek);
            }

            if (!currentWeek || !currentWeek.days?.length) {
                throw new Error("Rutina vacía");
            }

            const text = buildToonRoutine(currentWeek);

            if (!navigator?.clipboard?.writeText) {
                throw new Error("Clipboard API no disponible");
            }

            await navigator.clipboard.writeText(text);
            setCopyState("success");
            setCopyMessage("Rutina copiada ");
        } catch (error) {
            console.error("Error copiando rutina:", error);
            setCopyState("error");
            setCopyMessage("No pudimos copiar la rutina. Revisá el acceso al sheet.");
        } finally {
            setIsCopying(false);
        }
    };

    return (
        <div className="px-5 pt-8 pb-10">
            <header className="mb-6">
                <h1 className="text-3xl font-extrabold tracking-tight">Perfil</h1>
                <p className="text-ios-gray mt-1 text-sm font-medium uppercase tracking-wider">
                    Herramientas rápidas
                </p>
            </header>

            <div className="ios-card p-5 bg-white space-y-4">
                <div className="space-y-1">
                    <div className="text-sm font-black text-black">Rutina para IA</div>
                    <p className="text-xs text-ios-gray">
                        Copiamos la rutina de la hoja &quot;Semana 1&quot; (columnas A y B), separada por
                        cada celda &quot;DIA X&quot;, en un bloque <span className="font-semibold">toon</span>.
                    </p>
                </div>

                {!hasSetup && (
                    <div className="flex items-start gap-2 rounded-2xl bg-orange-50 px-3 py-2 text-xs text-orange-800 border border-orange-200">
                        <AlertCircle size={16} className="mt-0.5 shrink-0" />
                        <div>Conectá tu cuenta de Google y el spreadsheet para habilitar estas acciones.</div>
                    </div>
                )}

                {loadError && (
                    <div className="flex items-start gap-2 rounded-2xl bg-red-50 px-3 py-2 text-xs text-red-700 border border-red-200">
                        <AlertCircle size={16} className="mt-0.5 shrink-0" />
                        <div>{loadError}</div>
                    </div>
                )}

                <button
                    type="button"
                    onClick={handleCopyRoutine}
                    disabled={isCopying || !hasSetup}
                    className={`w-full py-3 rounded-2xl font-bold flex items-center justify-center gap-2 text-sm ${
                        isCopying || !hasSetup
                            ? "bg-black/10 text-black/40"
                            : "bg-black text-white hover:bg-black/90 active:translate-y-px transition"
                    }`}
                >
                    {isCopying ? <Loader2 size={16} className="animate-spin" /> : <Copy size={16} />}
                    Copiar rutina para ChatGPT
                </button>

                <button
                    type="button"
                    onClick={() => {
                        const url = ROUTINE_BUILDER_URL;
                        const isAndroid = /Android/i.test(navigator.userAgent);
                        const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

                        if (isAndroid) {
                            // Intent para Android: intenta abrir en la app, si no está instalada usa el navegador
                            const intentUrl = `intent://gemini.google.com/gem/1h78boD42OJHWVL_adZzOtrEEs-uwERAn?usp=sharing&hl=es_419#Intent;scheme=https;package=com.google.android.apps.bard;end`;
                            window.location.href = intentUrl;
                        } else if (isIOS) {
                            // En iOS, los Universal Links funcionan automáticamente sin target="_blank"
                            // Usamos window.open sin target para permitir que iOS intercepte el enlace
                            window.open(url, '_self');
                        } else {
                            // Desktop: abrimos en la misma ventana
                            window.location.href = url;
                        }
                    }}
                    className="w-full py-3 rounded-2xl font-bold flex items-center justify-center gap-2 text-sm border border-black/10 text-black bg-white hover:bg-black/[0.02] active:translate-y-px transition"
                >
                    Armador de rutinas
                    <ExternalLink size={16} />
                </button>

                {copyMessage && (
                    <div
                        className={`flex items-center gap-2 text-xs font-semibold ${
                            copyState === "success"
                                ? "text-green-700"
                                : copyState === "error"
                                ? "text-red-700"
                                : "text-gray-500"
                        }`}
                    >
                        {copyState === "success" && <Check size={16} />}
                        {copyState === "error" && <AlertCircle size={16} />}
                        <span>{copyMessage}</span>
                    </div>
                )}

                {isLoadingWeek && hasSetup && (
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                        <Loader2 size={16} className="animate-spin" />
                        Cargando Semana 1...
                    </div>
                )}

                
            </div>
        </div>
    );
}