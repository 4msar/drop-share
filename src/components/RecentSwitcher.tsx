import { useState } from "react";
import type { RecentItem } from "../lib/recent";
import { RecentList } from "./RecentList";

interface RecentSwitcherProps {
    title: string;
    currentId: string;
    items: RecentItem[];
}

/** A dropdown next to the viewer title for jumping between recently viewed artifacts. */
export function RecentSwitcher({
    title,
    currentId,
    items,
}: RecentSwitcherProps) {
    const [open, setOpen] = useState(false);

    return (
        <>
            <div className="relative">
                <button
                    type="button"
                    aria-label="Switch artifact"
                    title="Switch artifact"
                    aria-expanded={open}
                    onClick={() => {
                        if (items.length <= 1) {
                            return;
                        }
                        setOpen((value) => !value);
                    }}
                    className="p-1 rounded-md text-body hover:bg-brand-soft hover:text-brand truncate block px-2 max-w-[calc(100vw-8rem)]"
                >
                    {title}
                </button>
                {items.length > 1 && open && (
                    <div className="absolute left-0 top-full z-10 mt-1 max-w-[calc(100vw-8rem)] min-w-full sm:max-w-sm rounded-xl border border-edge bg-surface shadow-lg max-h-[75vh] overflow-y-auto scrollbar-none">
                        <RecentList
                            items={items}
                            currentId={currentId}
                            onSelect={() => setOpen(false)}
                        />
                    </div>
                )}
            </div>
            {open && (
                <div
                    className="fixed inset-0 z-0"
                    onClick={() => setOpen(false)}
                />
            )}
        </>
    );
}
