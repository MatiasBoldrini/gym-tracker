import { useLayoutEffect, useRef, type ReactNode } from "react";

export function ModalFrame({ label, onClose, children }: {
    label: string;
    onClose: () => void;
    children: ReactNode;
}) {
    const ref = useRef<HTMLDialogElement>(null);
    useLayoutEffect(() => {
        const dialog = ref.current!;
        dialog.showModal();
        return () => dialog.close();
    }, []);
    return <dialog ref={ref} aria-label={label} className="fixed inset-0 m-0 h-dvh w-full max-h-none max-w-none overflow-auto border-0 bg-transparent p-0 backdrop:bg-transparent"
        onCancel={event => { event.preventDefault(); onClose(); }}>
        {children}
    </dialog>;
}
