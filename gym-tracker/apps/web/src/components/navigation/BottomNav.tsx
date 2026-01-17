import { Home, LineChart, Activity, User, PenSquare } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/hooks/useAuth";

export function BottomNav() {
    const { pathname } = useLocation();
    const { isAuthenticated, isLoading } = useAuth();

    const navItems = [
        { name: "Rutina", icon: Home, href: "/" },
        { name: "Crear", icon: PenSquare, href: "/rutina" },
        { name: "Fatiga", icon: Activity, href: "/fatiga" },
        { name: "Progreso", icon: LineChart, href: "/progreso" },
        { name: "Perfil", icon: User, href: "/perfil" },
    ];

    // No mostrar la barra de navegación si no está autenticado o está cargando
    if (isLoading || !isAuthenticated) {
        return null;
    }

    return (
        <nav className="fixed bottom-0 left-0 right-0 bg-white/70 backdrop-blur-md border-t border-black/5 px-4 flex justify-around items-center z-[9999] pointer-events-auto h-[calc(var(--bottom-nav-base)+env(safe-area-inset-bottom))] pt-2 pb-[env(safe-area-inset-bottom)]">
            {navItems.map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;

                return (
                    <Link
                        key={item.name}
                        to={item.href}
                        onClick={(e) => {
                            if (isActive) {
                                e.preventDefault();
                            }
                        }}
                        aria-current={isActive ? "page" : undefined}
                        className={`pointer-events-auto touch-manipulation flex flex-col items-center gap-1 transition-colors ${isActive ? "text-ios-blue" : "text-ios-gray"
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
