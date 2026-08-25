import { useState } from "react";
import type { RecentItem } from "../lib/recent";
import { RecentList } from "./RecentList";

interface RecentSwitcherProps {
  currentId: string;
  items: RecentItem[];
}

/** A dropdown next to the viewer title for jumping between recently viewed artifacts. */
export function RecentSwitcher({ currentId, items }: RecentSwitcherProps) {
  const [open, setOpen] = useState(false);

  if (items.length <= 1) return null;

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Switch artifact"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="grid size-6 shrink-0 place-items-center rounded-full text-body hover:bg-brand-soft hover:text-brand"
      >
        ⌄
      </button>
      {open && (
        <div className="absolute left-0 top-full z-10 mt-1 w-56 rounded-xl border border-edge bg-surface p-1 shadow-lg">
          <RecentList items={items} currentId={currentId} onSelect={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
