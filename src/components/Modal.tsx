import type { FormEventHandler, ReactNode } from "react";

interface ModalProps {
    children: ReactNode;
    /** Renders the panel as a <form> instead of a <div> when given. */
    onSubmit?: FormEventHandler<HTMLFormElement>;
}

const PANEL_CLASS =
    "w-full max-w-sm rounded-2xl border border-edge bg-panel p-5 shadow-2xl";

/** Shared centered backdrop + panel wrapper for the header's dialogs. */
export function Modal({ children, onSubmit }: ModalProps) {
    return (
        <div className="fixed inset-0 z-30 grid place-items-center bg-black/40 p-4">
            {onSubmit ? (
                <form className={PANEL_CLASS} onSubmit={onSubmit}>
                    {children}
                </form>
            ) : (
                <div className={PANEL_CLASS}>{children}</div>
            )}
        </div>
    );
}
