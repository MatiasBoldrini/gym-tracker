"use client";

import { Home, LineChart, Activity, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function BottomNav() {
    const pathname = usePathname();

    const navItems = [
        { name: "Rutina", icon: Home, href: "/" },
        { name: "Fatiga", icon: Activity, href: "/fatiga" },
        { name: "Progreso", icon: LineChart, href: "/progreso" },
        { name: "Perfil", icon: User, href: "/perfil" },
    ];

    return (
        <nav className="fixed bottom-0 left-0 right-0 bg-white/70 backdrop-blur-md border-t border-black/5 pb-8 pt-3 px-8 flex justify-between items-center z-[100]">
            {navItems.map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;

                return (
                    <Link
                        key={item.name}
                        href={item.href}
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
