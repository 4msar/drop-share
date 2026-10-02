export const SIDEBAR_STORAGE_KEY = "drop-share:sidebar-open";

/** Below this width the file list stacks above the preview instead of beside it (Tailwind's `md`). */
export const SIDEBAR_BREAKPOINT_PX = 768;

/** The default when the viewer hasn't chosen: open beside the preview, closed when stacked. */
export function defaultSidebarOpen(width: number): boolean {
    return width >= SIDEBAR_BREAKPOINT_PX;
}

/** The viewer's last explicit open/closed choice, or null if they never toggled it. */
export function getSavedSidebarOpen(): boolean | null {
    try {
        const raw = localStorage.getItem(SIDEBAR_STORAGE_KEY);
        return raw === "true" ? true : raw === "false" ? false : null;
    } catch {
        return null;
    }
}

/** Remembers an explicit toggle so the next visit (and every artifact) opens the same way. */
export function saveSidebarOpen(open: boolean): void {
    try {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, String(open));
    } catch {
        // Storage is unavailable or full; the toggle still works for this page.
    }
}
