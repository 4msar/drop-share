import { useState } from "react";
import { getRecentItems } from "../lib/recent";
import { RecentList } from "./RecentList";

/** A chevron pinned to the right edge that slides out recently viewed artifacts. */
export function RecentDrawer() {
  const [open, setOpen] = useState(false);
  const [items] = useState(() => getRecentItems());

  if (items.length === 0) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Recent artifacts"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="fixed top-1/2 right-0 z-20 grid h-12 w-6 -translate-y-1/2 place-items-center rounded-l-lg border border-r-0 border-edge bg-panel text-body hover:text-brand"
      >
        {open ? "›" : "‹"}
      </button>
      <aside
        className={`fixed top-0 right-0 z-10 flex h-full w-72 flex-col gap-3 border-l border-edge bg-panel p-4 shadow-lg transition-transform duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <h2 className="text-sm font-semibold text-heading">Recent</h2>
        <RecentList items={items} />
      </aside>
    </>
  );
}
