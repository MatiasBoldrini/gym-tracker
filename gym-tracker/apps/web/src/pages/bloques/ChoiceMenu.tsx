import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { Check } from "lucide-react";

export type Choice = { value: string | number; text: string; choose: () => void; content?: ReactNode };
type Props = {
    label: string;
    selected: Choice["value"];
    choices: Choice[];
    variant: "crumb" | "rating";
    triggerLabel?: string;
    children?: ReactNode;
};

export function ChoiceMenu({ label, selected, choices, variant, triggerLabel, children }: Props) {
    const id = useId();
    const trigger = useRef<HTMLButtonElement>(null);
    const panel = useRef<HTMLDivElement>(null);
    const enterOnOpen = useRef(false);
    const [open, setOpen] = useState(false);
    const selectedIndex = choices.findIndex(choice => choice.value === selected);
    const text = choices[selectedIndex]?.text ?? label;
    const accessibleName = triggerLabel ?? text;
    const triggerContent = children ?? text;
    const nativeArrows = typeof HTMLElement !== "undefined" && "focusGroup" in HTMLElement.prototype;

    function focusOption(index: number) {
        panel.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')[index]?.focus();
    }

    useLayoutEffect(() => {
        const button = trigger.current;
        const menu = panel.current;
        if (!open || !button || !menu) return;
        // Older Safari supports popovers but needs explicit viewport coordinates.
        const needsPosition = !CSS.supports("top", "anchor(bottom)");
        function position() {
            if (!button || !menu) return;
            const rect = button.getBoundingClientRect();
            const left = variant === "rating" ? rect.right - menu.offsetWidth : rect.left;
            menu.style.left = Math.max(8, Math.min(left, document.documentElement.clientWidth - menu.offsetWidth - 8)) + "px";
            menu.style.top = rect.bottom + 6 + "px";
        }
        if (needsPosition) {
            position();
            window.addEventListener("resize", position);
            window.addEventListener("scroll", position, true);
        }
        return () => {
            window.removeEventListener("resize", position);
            window.removeEventListener("scroll", position, true);
        };
    }, [open, variant]);

    function onMenuKey(event: KeyboardEvent<HTMLDivElement>) {
        if (event.key === "Escape") {
            event.preventDefault();
            panel.current?.hidePopover();
            trigger.current?.focus({ preventScroll: true });
            return;
        }
        if (nativeArrows) return;
        const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'));
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        let next: number;
        switch (event.key) {
            case "ArrowDown": next = (index + 1) % items.length; break;
            case "ArrowUp": next = (index - 1 + items.length) % items.length; break;
            case "Home": next = 0; break;
            case "End": next = items.length - 1; break;
            default: return;
        }
        event.preventDefault();
        items[next]?.focus();
    }

    // Keep the choices keyboard- and touch-accessible on browsers without popovers.
    if (typeof HTMLElement !== "undefined" && !("showPopover" in HTMLElement.prototype)) {
        return <div className={`choice-menu choice-menu-${variant} choice-menu-fallback`}>
            <span className={`choice-trigger ${variant === "crumb" ? "routine-crumb" : "rating-trigger"}`} aria-hidden="true">{triggerContent}</span>
            <select aria-label={accessibleName} value={selected}
                onChange={event => choices[event.currentTarget.selectedIndex]?.choose()}>
                {choices.map(choice => <option key={choice.value} value={choice.value}>{choice.text}</option>)}
            </select>
        </div>;
    }

    return <div className={`choice-menu choice-menu-${variant}`}
        style={{ "--crumb-anchor": "--crumb-" + id.replace(/[^a-zA-Z0-9_-]/g, "") } as CSSProperties}
        onBlur={event => {
            if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) panel.current?.hidePopover();
        }}>
        <button className={`choice-trigger ${variant === "crumb" ? "routine-crumb" : "rating-trigger"}`} id={id} ref={trigger} type="button" popoverTarget={id + "-panel"}
            aria-label={accessibleName} aria-haspopup="menu" aria-expanded={open} aria-controls={id + "-menu"}
            onClick={event => { enterOnOpen.current = event.detail === 0; }}
            onKeyDown={event => {
                if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
                event.preventDefault();
                if (panel.current?.matches(":popover-open")) focusOption(Math.max(0, selectedIndex));
                else { enterOnOpen.current = true; panel.current?.showPopover(); }
            }}>
            {variant === "crumb" ? <span>{triggerContent}</span> : triggerContent}
        </button>
        <div className={`routine-crumb-panel choice-panel-${variant}`} popover="auto" id={id + "-panel"} ref={panel}
            onToggle={event => {
                const visible = event.currentTarget.matches(":popover-open");
                setOpen(visible);
                if (visible && enterOnOpen.current) focusOption(Math.max(0, selectedIndex));
                enterOnOpen.current = false;
            }}>
            <div id={id + "-menu"} {...{ focusgroup: "menu block wrap nomemory" }} role="menu"
                aria-label={label} onKeyDown={onMenuKey}>
                {choices.map(choice => <button type="button" key={choice.value} role="menuitemradio"
                    aria-label={choice.text} aria-checked={choice.value === selected} tabIndex={nativeArrows ? undefined : -1}
                    onClick={() => {
                        if (choice.value !== selected) choice.choose();
                        panel.current?.hidePopover();
                        trigger.current?.focus({ preventScroll: true });
                    }}>
                    {choice.content ?? <span>{choice.text}</span>}{choice.value === selected && <Check size={16} strokeWidth={2.3} aria-hidden="true" />}
                </button>)}
            </div>
        </div>
    </div>;
}
