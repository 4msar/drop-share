import { useState } from "react";
import { clearRecentItems, getRecentItems } from "../lib/recent";
import { RecentList } from "./RecentList";
import { ChevronIcon } from "./Icons";
import { cn } from "../lib/utils";

/** A chevron pinned to the right edge that slides out recently viewed artifacts. */
export function RecentDrawer() {
    const [open, setOpen] = useState(false);
    const [items, setItems] = useState(() => getRecentItems());

    const handleClearRecentItems = () => {
        clearRecentItems();
        setOpen(false);
        setItems([]);
    };

    if (items.length === 0) return null;

    return (
        <>
            <div
                aria-label="Close recent artifacts"
                onClick={() => setOpen(false)}
                className={cn(
                    "fixed inset-0 z-10 cursor-default bg-black/10 backdrop-blur-xs transition-all",
                    open
                        ? "z-10 opacity-100 pointer-events-auto"
                        : "z-[-1] opacity-0 pointer-events-none",
                )}
            />
            <button
                type="button"
                aria-label="Recent artifacts"
                aria-expanded={open}
                onClick={() => setOpen((value) => !value)}
                className="fixed top-1/2 right-0 z-30 grid h-10 w-5 -translate-y-1/2 place-items-center rounded-l-lg border border-r-0 border-edge bg-panel text-body hover:text-brand"
            >
                <ChevronIcon type={open ? "left" : "right"} />
            </button>
            <aside
                className={`fixed top-0 right-0 z-20 flex h-full w-72 flex-col gap-4 border-l border-edge bg-panel shadow-lg transition-transform duration-200 ${
                    open ? "translate-x-0" : "translate-x-full"
                }`}
            >
                <div className="flex items-center justify-between p-4 pb-0">
                    <h2 className="text-sm font-semibold text-heading">
                        Recent
                    </h2>
                    <button
                        type="button"
                        aria-label="Clear recent artifacts"
                        onClick={handleClearRecentItems}
                        className="text-xs hover:text-brand"
                    >
                        clear all
                    </button>
                </div>
                <hr className="border-edge" />
                <RecentList
                    items={items}
                    className="overflow-y-auto scrollbar-none"
                />
            </aside>
        </>
    );
}
