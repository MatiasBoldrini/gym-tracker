"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Copy, Check, Loader2, AlertCircle, LogOut, FileSpreadsheet, RefreshCw } from "lucide-react";
import { fetchWeekData, resetMesociclo } from "@/lib/sheets-client";
import { Week } from "@/types";
import { useAuth } from "@/lib/hooks/useAuth";
import Link from "next/link";
import { useRouter } from "next/navigation";

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
    const router = useRouter();
    const [week, setWeek] = useState<Week | null>(null);
    const [isLoadingWeek, setIsLoadingWeek] = useState(false);
    const [copyState, setCopyState] = useState<CopyState>("idle");
    const [copyMessage, setCopyMessage] = useState<string | null>(null);
    const [isCopying, setIsCopying] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [isResettingMesociclo, setIsResettingMesociclo] = useState(false);

    const isReady = auth.isAuthenticated;

    const loadWeek = useCallback(async () => {
        if (!isReady) return;
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
    }, [isReady]);

    useEffect(() => {
        if (auth.isLoading) return;
        if (!isReady) return;
        if (week || isLoadingWeek) return;
        loadWeek();
    }, [auth.isLoading, isReady, isLoadingWeek, loadWeek, week]);

    const routinePreview = useMemo(() => {
        if (!week || !week.days?.length) return null;
        return buildToonRoutine(week);
    }, [week]);

    const handleCopyRoutine = async () => {
        if (!isReady) {
            setCopyState("error");
            setCopyMessage("Conectá tu cuenta de Google para copiar la rutina.");
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

    const handleConnectGoogle = () => {
        auth.login();
    };

    const handleRedoOnboarding = async () => {
        if (!isReady) return;

        const confirmed = window.confirm(
            "⚠️ Esto borrará todas las semanas excepto Semana 1 y reiniciará el wizard de configuración.\n\n¿Estás seguro?"
        );

        if (!confirmed) return;

        setIsResettingMesociclo(true);
        
        try {
            // Reset mesociclo (delete Semana 2..N)
            const result = await resetMesociclo();
            
            if (!result.ok) {
                throw new Error(result.error || "Error al resetear mesociclo");
            }

            // Clear onboarding flags
            localStorage.removeItem("onboarding_completed_v1");
            localStorage.removeItem("onboarding_dismissed_v1");

            // Navigate to home with force flag
            router.push("/?force_onboarding=true");
        } catch (error: any) {
            console.error("Error resetting onboarding:", error);
            alert("Error al resetear: " + (error.message || "Intentá de nuevo"));
        } finally {
            setIsResettingMesociclo(false);
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

                {!isReady && !auth.isLoading && (
                    <div className="flex items-start gap-2 rounded-2xl bg-orange-50 px-3 py-2 text-xs text-orange-800 border border-orange-200">
                        <AlertCircle size={16} className="mt-0.5 shrink-0" />
                        <div>Conectá tu cuenta de Google para habilitar estas acciones.</div>
                    </div>
                )}

                {loadError && (
                    <div className="flex items-start gap-2 rounded-2xl bg-red-50 px-3 py-2 text-xs text-red-700 border border-red-200">
                        <AlertCircle size={16} className="mt-0.5 shrink-0" />
                        <div>{loadError}</div>
                    </div>
                )}

                {!isReady && !auth.isLoading ? (
                    <button
                        type="button"
                        onClick={handleConnectGoogle}
                        className="w-full py-3 rounded-2xl font-bold flex items-center justify-center gap-2 text-sm bg-black text-white"
                    >
                        Conectar con Google
                    </button>
                ) : (
                    <>
                        <button
                            type="button"
                            onClick={handleCopyRoutine}
                            disabled={isCopying || !isReady}
                            className={`w-full py-3 rounded-2xl font-bold flex items-center justify-center gap-2 text-sm ${
                                isCopying || !isReady
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
                                    const intentUrl = `intent://gemini.google.com/gem/1h78boD42OJHWVL_adZzOtrEEs-uwERAn?usp=sharing&hl=es_419#Intent;scheme=https;package=com.google.android.apps.bard;end`;
                                    window.location.href = intentUrl;
                                } else if (isIOS) {
                                    window.open(url, '_self');
                                } else {
                                    window.location.href = url;
                                }
                            }}
                            className="w-full py-3 rounded-2xl font-bold flex items-center justify-center gap-2 text-sm border border-black/10 text-black bg-white hover:bg-black/[0.02] active:translate-y-px transition"
                        >
                            Armador de rutinas
                            <ExternalLink size={16} />
                        </button>
                    </>
                )}

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

                {isLoadingWeek && isReady && (
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                        <Loader2 size={16} className="animate-spin" />
                        Cargando Semana 1...
                    </div>
                )}

                {isReady && (
                    <button
                        type="button"
                        onClick={handleRedoOnboarding}
                        disabled={isResettingMesociclo}
                        className={`w-full py-3 rounded-2xl font-bold flex items-center justify-center gap-2 text-sm ${
                            isResettingMesociclo
                                ? "bg-black/10 text-black/40"
                                : "bg-ios-blue text-white hover:bg-ios-blue/90 active:translate-y-px transition"
                        }`}
                    >
                        {isResettingMesociclo ? (
                            <Loader2 size={16} className="animate-spin" />
                        ) : (
                            <RefreshCw size={16} />
                        )}
                        Rehacer onboarding
                    </button>
                )}

                <div className="pt-2">
                    <Link
                        href="/pwa-debug"
                        className="text-xs font-bold text-ios-gray underline underline-offset-4"
                    >
                        Debug PWA
                    </Link>
                </div>
            </div>

            {/* Sección Cuenta */}
            {isReady && (
                <div className="ios-card p-5 bg-white space-y-4 mt-4">
                    <div className="space-y-1">
                        <div className="text-sm font-black text-black">Cuenta</div>
                        <p className="text-xs text-ios-gray">
                            {auth.email && (
                                <span>Conectado como <span className="font-semibold">{auth.email}</span></span>
                            )}
                        </p>
                    </div>

                    {auth.spreadsheetId && (
                        <button
                            type="button"
                            onClick={() => {
                                const url = `https://docs.google.com/spreadsheets/d/${auth.spreadsheetId}`;
                                window.open(url, "_blank");
                            }}
                            className="w-full py-3 rounded-2xl font-bold flex items-center justify-center gap-2 text-sm bg-black text-white hover:bg-black/90 active:translate-y-px transition"
                        >
                            <FileSpreadsheet size={16} />
                            Ver mi rutina en Sheets
                        </button>
                    )}

                    <button
                        type="button"
                        onClick={async () => {
                            // Borrar todas las cookies del dominio
                            document.cookie.split(";").forEach((c) => {
                                document.cookie = c
                                    .replace(/^ +/, "")
                                    .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
                            });
                            // Llamar logout
                            await auth.logout();
                            // Refresh para limpiar estado
                            window.location.href = "/";
                        }}
                        className="w-full py-3 rounded-2xl font-bold flex items-center justify-center gap-2 text-sm border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 active:translate-y-px transition"
                    >
                        <LogOut size={16} />
                        Cerrar sesión
                    </button>
                </div>
            )}
        </div>
    );
}
