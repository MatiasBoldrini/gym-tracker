"use client";

import { Home, LineChart, Activity, User } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

export function BottomNav() {
    const pathname = usePathname();
    const router = useRouter();

    const navItems = [
        { name: "Rutina", icon: Home, href: "/" },
        { name: "Fatiga", icon: Activity, href: "/fatiga" },
        { name: "Progreso", icon: LineChart, href: "/progreso" },
        { name: "Perfil", icon: User, href: "/perfil" },
    ];

    // Prefetch proactivo para que el cambio de pantalla no dependa del "click".
    // En dev Next a veces no prefetch-ea automáticamente; esto ayuda mucho.
    useEffect(() => {
        navItems.forEach((i) => {
            // best-effort
            try {
                router.prefetch(i.href);
            } catch { }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <nav className="fixed bottom-0 left-0 right-0 bg-white/70 backdrop-blur-md border-t border-black/5 px-8 flex justify-between items-center z-[100] h-[calc(var(--bottom-nav-base)+env(safe-area-inset-bottom))] pt-2 pb-[env(safe-area-inset-bottom)]">
            {navItems.map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;

                return (
                    <Link
                        key={item.name}
                        href={item.href}
                        prefetch={true}
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
                        className={`flex flex-col items-center gap-1 transition-colors ${isActive ? "text-ios-blue" : "text-ios-gray"
                            }`}
                    >
                        <Icon size={24} />
                        <span className="text-[10px] font-medium">{item.name}</span>
                    </Link>
                );
            })}
        </nav>
    );
}
