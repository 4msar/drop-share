import { useState } from "react";
import { RecentList } from "./RecentList";
import { ChevronIcon } from "./Icons";
import { useArtifactState } from "../contexts/useArtifact";
import { useRecentItems } from "../contexts/useRecentItems";

interface RecentSwitcherProps {
    title: string;
}

/** A dropdown next to the viewer title for jumping between recently viewed artifacts. */
export function RecentSwitcher({ title }: RecentSwitcherProps) {
    const { id: currentId } = useArtifactState();
    const items = useRecentItems();
    const [open, setOpen] = useState(false);

    if (items.length <= 1) {
        return (
            <div className="relative py-1 px-2">
                <span className="rounded-md transition-all text-sm p-1 hover:bg-brand-soft hover:text-brand truncate block max-w-[calc(100vw-8rem)] border border-transparent hover:border-brand/5 px-2">
                    {title}
                </span>
            </div>
        );
    }

    return (
        <>
            <div className="relative py-1 px-2 ">
                <button
                    type="button"
                    aria-label="Switch artifact"
                    title="Switch artifact"
                    aria-expanded={open}
                    onClick={() => {
                        setOpen((value) => !value);
                    }}
                    className="rounded-md transition-all text-sm p-1 hover:bg-brand-soft hover:text-brand truncate block max-w-[calc(100vw-8rem)] border border-transparent hover:border-brand/5 px-2"
                >
                    {title}
                    <ChevronIcon
                        type="down"
                        className="size-4 inline-block ml-1 -mt-0.5 text-body/50"
                    />
                </button>
                {open && (
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
