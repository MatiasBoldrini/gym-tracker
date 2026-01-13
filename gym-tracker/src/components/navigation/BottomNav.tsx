"use client";

import { Home, LineChart, Activity, User, PenSquare } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/lib/hooks/useAuth";

export function BottomNav() {
    const pathname = usePathname();
    const router = useRouter();
    const { isAuthenticated, isLoading } = useAuth();
    const [debugLog, setDebugLog] = useState<string[]>([]);
    const logCountRef = useRef(0);

    const addDebugLog = (message: string) => {
        logCountRef.current++;
        setDebugLog(prev => [...prev.slice(-4), `${logCountRef.current}. ${message}`]);
        console.log(message);
    };

    // Log pathname changes
    useEffect(() => {
        addDebugLog(`🔵 Pathname: ${pathname}`);
    }, [pathname]);

    const navItems = [
        { name: "Rutina", icon: Home, href: "/" },
        { name: "Crear", icon: PenSquare, href: "/rutina" },
        { name: "Fatiga", icon: Activity, href: "/fatiga" },
        { name: "Progreso", icon: LineChart, href: "/progreso" },
        { name: "Perfil", icon: User, href: "/perfil" },
    ];

    // Prefetch proactivo para que el cambio de pantalla no dependa del "click".
    // En dev Next a veces no prefetch-ea automáticamente; esto ayuda mucho.
    useEffect(() => {
        if (!isAuthenticated) return;
        navItems.forEach((i) => {
            // best-effort
            try {
                router.prefetch(i.href);
            } catch { }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAuthenticated]);

    // No mostrar la barra de navegación si no está autenticado o está cargando
    if (isLoading || !isAuthenticated) {
        return null;
    }

    return (
        <>
            {/* Debug Log */}
            {debugLog.length > 0 && (
                <div className="fixed bottom-[calc(var(--bottom-nav-base)+env(safe-area-inset-bottom)+0.5rem)] left-2 right-2 bg-black/90 text-white text-[10px] p-2 rounded-lg z-[1001] font-mono max-h-32 overflow-auto">
                    {debugLog.map((log, i) => (
                        <div key={i}>{log}</div>
                    ))}
                </div>
            )}
        
        <nav className="fixed bottom-0 left-0 right-0 bg-white/70 backdrop-blur-md border-t border-black/5 px-4 flex justify-around items-center z-[1000] pointer-events-auto h-[calc(var(--bottom-nav-base)+env(safe-area-inset-bottom))] pt-2 pb-[env(safe-area-inset-bottom)]">
            {navItems.map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;

                return (
                    <button
                        key={item.name}
                        type="button"
                        onPointerDown={(e) => {
                            addDebugLog(`🔵 PointerDown: ${item.name} -> ${item.href}`);
                            
                            // En mobile (y con dnd/gestos), onClick puede quedar "tarde" o encolarse.
                            // PointerDown es inmediato y evita el síntoma de "clickeo navbar, recién navega
                            // cuando clickeo otro botón".
                            if (pathname === item.href) {
                                addDebugLog(`🔵 Same path, ignoring`);
                                return;
                            }
                            
                            e.preventDefault();
                            e.stopPropagation();
                            
                            addDebugLog(`🔵 Calling router.push: ${item.href}`);
                            router.push(item.href);
                            addDebugLog(`🔵 router.push called`);
                        }}
                        onClick={(e) => {
                            addDebugLog(`🟡 Click: ${item.name}`);
                        }}
                        onMouseEnter={() => {
                            try {
                                router.prefetch(item.href);
                            } catch { }
                        }}
                        onTouchStart={() => {
                            try {
                                router.prefetch(item.href);
                            } catch { }
                        }}
                        aria-current={isActive ? "page" : undefined}
                        className={`pointer-events-auto touch-manipulation flex flex-col items-center gap-1 transition-colors ${isActive ? "text-ios-blue" : "text-ios-gray"
                            }`}
                    >
                        <Icon size={24} />
                        <span className="text-[10px] font-medium">{item.name}</span>
                    </button>
                );
            })}
        </nav>
        </>
    );
}
