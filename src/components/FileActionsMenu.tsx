import { useLayoutEffect, useRef, useState } from "react";
import {
    ActionIcon,
    DownloadIcon,
    EyeIcon,
    ShareIcon,
    TrashIcon,
} from "./Icons";

interface FileActionsMenuProps {
    /** The file's (or directory's) raw URL, relative to this origin. */
    href: string;
    /** The file/directory name, used for labelling and the download filename. */
    label: string;
    /**
     * When set, a "Download" item is offered saving the file under this name.
     * Directories omit it - there's nothing single to download.
     */
    downloadName?: string;
    /** Whether the current session may delete (i.e. the artifact is modifiable). */
    canDelete: boolean;
    /** Invoked when the user confirms deletion; only reachable when `canDelete`. */
    onDelete?: () => void;
    /** Disables the Delete item while a deletion is already in flight. */
    deleting?: boolean;
}

const MENU_WIDTH = 176; // Tailwind w-44
const COPY_FEEDBACK_MS = 1500;
const VIEWPORT_MARGIN = 8;

const ITEM =
    "flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-xs " +
    "text-heading hover:bg-brand-soft disabled:opacity-60";

/**
 * A per-row "more actions" dropdown for a file in the viewer sidebar,
 * replacing the old single "open in new tab" affordance. It positions itself
 * with `position: fixed`, anchored to its trigger button, so the menu is never
 * clipped by the sidebar's own scroll overflow.
 */
export function FileActionsMenu({
    href,
    label,
    downloadName,
    canDelete,
    onDelete,
    deleting,
}: FileActionsMenuProps) {
    const buttonRef = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(false);
    const [coords, setCoords] = useState({ top: 0, left: 0 });
    const [copyLabel, setCopyLabel] = useState("Copy link");

    // Item count drives the height estimate that decides whether the menu
    // opens below the trigger or flips above it near the viewport's bottom.
    const itemCount = 2 + (downloadName ? 1 : 0) + (canDelete ? 1 : 0);
    const estimatedHeight = itemCount * 32 + 12;

    useLayoutEffect(() => {
        if (!open) return;
        function reposition() {
            const button = buttonRef.current;
            if (!button) return;
            const rect = button.getBoundingClientRect();
            const left = Math.max(
                VIEWPORT_MARGIN,
                Math.min(
                    rect.right - MENU_WIDTH,
                    window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN,
                ),
            );
            const opensUpward =
                rect.bottom + estimatedHeight >
                window.innerHeight - VIEWPORT_MARGIN;
            const top = opensUpward
                ? rect.top - estimatedHeight
                : rect.bottom + 4;
            setCoords({ top, left });
        }
        reposition();
        // A fixed menu detaches from its anchor once the page scrolls, so close
        // it rather than let it drift.
        const close = () => setOpen(false);
        window.addEventListener("scroll", close, true);
        window.addEventListener("resize", close);
        return () => {
            window.removeEventListener("scroll", close, true);
            window.removeEventListener("resize", close);
        };
    }, [open, estimatedHeight]);

    async function onCopyLink() {
        try {
            const absolute = new URL(href, window.location.origin).href;
            await navigator.clipboard.writeText(absolute);
            setCopyLabel("Copied!");
        } catch {
            setCopyLabel("Copy failed");
        }
        window.setTimeout(() => setCopyLabel("Copy link"), COPY_FEEDBACK_MS);
    }

    return (
        <>
            <button
                ref={buttonRef}
                type="button"
                aria-label={`Actions for ${label}`}
                aria-expanded={open}
                aria-haspopup="menu"
                onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setOpen((value) => !value);
                }}
                className="grid size-6 shrink-0 place-items-center rounded-sm text-sm text-body/50 no-underline transition-all hover:bg-brand-soft hover:text-brand focus-visible:bg-brand-soft focus-visible:text-brand focus-visible:outline-none"
                title="Actions"
            >
                <ActionIcon className="size-3.5" />
            </button>
            {open && (
                <>
                    <div
                        className="fixed inset-0 z-40"
                        onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setOpen(false);
                        }}
                    />
                    <div
                        role="menu"
                        style={{ top: coords.top, left: coords.left }}
                        className="fixed z-50 w-44 rounded-lg border border-edge bg-panel p-1.5 shadow-2xl"
                    >
                        <a
                            role="menuitem"
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => setOpen(false)}
                            className={`${ITEM} no-underline`}
                        >
                            <EyeIcon className="size-3.5 shrink-0" />
                            Open in new tab
                        </a>
                        <button
                            type="button"
                            role="menuitem"
                            onClick={() => void onCopyLink()}
                            className={ITEM}
                        >
                            <ShareIcon className="size-3.5 shrink-0" />
                            {copyLabel}
                        </button>
                        {downloadName && (
                            <a
                                role="menuitem"
                                href={href}
                                download={downloadName}
                                onClick={() => setOpen(false)}
                                className={`${ITEM} no-underline`}
                            >
                                <DownloadIcon className="size-3.5 shrink-0" />
                                Download
                            </a>
                        )}
                        {canDelete && (
                            <button
                                type="button"
                                role="menuitem"
                                disabled={deleting}
                                onClick={() => {
                                    setOpen(false);
                                    onDelete?.();
                                }}
                                className="mt-0.5 flex h-8 w-full items-center gap-2 rounded-md border-t border-edge px-2.5 pt-1.5 text-left text-xs text-red-500 hover:bg-red-500/10 disabled:opacity-60"
                            >
                                <TrashIcon className="size-3.5 shrink-0" />
                                {deleting ? "Deleting…" : "Delete"}
                            </button>
                        )}
                    </div>
                </>
            )}
        </>
    );
}
