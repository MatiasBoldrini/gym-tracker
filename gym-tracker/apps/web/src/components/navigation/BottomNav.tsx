import { Home, LineChart, Activity, User, PenSquare, type LucideIcon } from "lucide-react";
import { useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/hooks/useAuth";
import "./bottom-nav.css";

export function BottomNav() {
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

    return <NavigationBar items={navItems} />;
}

type NavItem = { name: string; href: string; icon: LucideIcon; pages?: string[] };
export function NavigationBar({ items }: { items: NavItem[] }) {
    const location = useLocation();
    const { pathname, search, hash } = location;
    const path = pathname.replace(/\/$/, "") || "/";
    const activeIndex = items.findIndex(item => item.href === path || item.pages?.includes(path));
    const barRef = useRef<HTMLElement>(null);
    const gesture = useRef<{
        id: number; x: number; y: number; origin: number; target: number; tabWidth: number; left: number;
        top: number; bottom: number; dragging: boolean;
    } | null>(null);
    const suppressClick = useRef(false);
    const [preview, setPreview] = useState<{
        location: typeof location; anchor: number; target: number; pressed: boolean;
    } | null>(null);
    const selection = preview?.location === location ? preview : null;
    const highlighted = selection?.target ?? activeIndex;

    useLayoutEffect(() => {
        // Back or a keyboard shortcut can change the route while a pointer is still down.
        if (gesture.current) suppressClick.current = true;
        gesture.current = null;
        const bar = barRef.current;
        if (bar) {
            bar.style.removeProperty("--drag-offset");
            delete bar.dataset.dragging;
        }
    }, [location]);

    function start(event: PointerEvent<HTMLElement>) {
        if (!event.isPrimary || event.button !== 0) return;
        suppressClick.current = false;
        if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
        const link = (event.target as Element).closest("a");
        if (!link) return;
        const bar = event.currentTarget;
        const index = Array.from(bar.children).indexOf(link);
        const rect = link.getBoundingClientRect();
        gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, origin: index, target: index, tabWidth: rect.width,
            left: rect.left - index * rect.width, top: rect.top, bottom: rect.bottom, dragging: false };
        link.setPointerCapture(event.pointerId);
        setPreview({ location, anchor: index, target: index, pressed: true });
    }

    function reset(bar: HTMLElement) {
        gesture.current = null;
        bar.style.removeProperty("--drag-offset");
        delete bar.dataset.dragging;
    }

    function track(drag: NonNullable<typeof gesture.current>, clientX: number, bar: HTMLElement) {
        const position = Math.max(0, Math.min(items.length - 1, drag.origin + (clientX - drag.x) / drag.tabWidth));
        bar.style.setProperty("--drag-offset", (position - drag.origin) * 100 + "%");
        // Keep a 3px band around the midpoint stable as the finger pauses or reverses.
        if (Math.abs(position - drag.target) > 0.5 + 3 / drag.tabWidth) {
            drag.target = Math.round(position);
            setPreview({ location, anchor: drag.origin, target: drag.target, pressed: true });
        }
    }

    function move(event: PointerEvent<HTMLElement>) {
        const drag = gesture.current;
        if (!drag || drag.id !== event.pointerId) return;
        const dx = event.clientX - drag.x;
        if (!drag.dragging) {
            const dy = Math.abs(event.clientY - drag.y);
            if (Math.max(Math.abs(dx), dy) < 5) return;
            if (dy > Math.abs(dx) * 1.25) {
                suppressClick.current = true;
                reset(event.currentTarget);
                setPreview(null);
                return;
            }
            if (Math.abs(dx) < dy * 1.25) return;
            drag.dragging = true;
            event.currentTarget.dataset.dragging = "";
            suppressClick.current = true;
        }
        track(drag, event.clientX, event.currentTarget);
    }

    function finish(event: PointerEvent<HTMLElement>) {
        const drag = gesture.current;
        if (!drag || drag.id !== event.pointerId) return;
        const bar = event.currentTarget;
        const inside = event.clientX >= drag.left && event.clientX < drag.left + items.length * drag.tabWidth
            && event.clientY >= drag.top && event.clientY <= drag.bottom;
        if (event.type !== "pointerup" || !inside) {
            reset(bar);
            setPreview(null);
            suppressClick.current = true;
            return;
        }
        if (drag.dragging) track(drag, event.clientX, bar);
        const index = drag.target;
        reset(bar);
        // Hold the destination across pointerup and the router's subsequent commit.
        setPreview({ location, anchor: index, target: index, pressed: false });
        if (drag.dragging) {
            // Commit through the same link as a tap, including its active subpage.
            const link = bar.children[index] as HTMLAnchorElement;
            link.focus({ preventScroll: true });
            link.click();
        }
    }

    return (
        <nav ref={barRef} aria-label="Navegación principal" className="bottom-nav"
            style={{ "--tab-count": items.length, "--tab-anchor": selection?.anchor ?? activeIndex } as CSSProperties}
            data-selected={highlighted >= 0 || undefined} data-pressed={selection?.pressed || undefined}
            onPointerDown={start} onPointerMove={move} onPointerUp={finish}
            onPointerCancel={finish} onLostPointerCapture={finish}
            onClickCapture={event => {
                if (suppressClick.current && event.detail !== 0) {
                    event.preventDefault();
                    event.stopPropagation();
                }
            }}>
            {items.map(({ name, href, icon: Icon }, index) => {
                const active = index === activeIndex;
                return <Link key={href} className="bottom-nav-link" draggable={false}
                    data-highlighted={highlighted === index || undefined}
                    to={active ? { pathname, search, hash } : href} replace={active} preventScrollReset={active}
                    aria-current={active ? (path === href ? "page" : "location") : undefined}>
                    <Icon size={22} strokeWidth={highlighted === index ? 2.5 : 1.85} aria-hidden="true" />
                    <span>{name}</span>
                </Link>;
            })}
        </nav>
    );
}
