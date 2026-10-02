import { Link } from "react-router";
import { withToken } from "../lib/artifact";
import { formatRelativeTime } from "../lib/format";
import { cn } from "../lib/utils";
import type { RecentItem } from "../lib/recent";
import { getStoredToken } from "../lib/tokens";
import { CloseIcon } from "./Icons";

/**
 * Where a recent item reopens: an owner's saved token wins (full access on
 * /a/), else the read-only share link it was last opened from, else /a/.
 */
function recentItemUrl(item: RecentItem): string {
    const token = getStoredToken(item.id);
    if (token) return withToken(`/a/${item.id}/`, token);
    return item.shareUrl ?? `/a/${item.id}/`;
}

interface RecentListProps {
    items: RecentItem[];
    currentId?: string;
    onSelect?: (id: string) => void;
    /** When given, each item gets a button that removes it from the list. */
    onRemove?: (id: string) => void;
}

export function RecentList({
    items,
    currentId,
    onSelect,
    onRemove,
    className = "",
}: RecentListProps & { className?: string }) {
    return (
        <ul className={`flex flex-col p-1 gap-1 ${className}`}>
            {items.map((item) => {
                const isCurrent = item.id === currentId;
                const label = (
                    <>
                        <span
                            className="block truncate text-sm font-medium text-heading"
                            title={item.label ? item.id : undefined}
                        >
                            {item.label || item.id}
                        </span>
                        <span className="block text-xs text-body">
                            {formatRelativeTime(item.visitedAt)}
                        </span>
                    </>
                );
                return (
                    <li key={item.id} className="relative">
                        {isCurrent ? (
                            <span
                                aria-current="page"
                                className={cn(
                                    "block rounded-lg px-3 py-2 text-left text-brand bg-panel",
                                    onRemove && "pr-9",
                                )}
                            >
                                {label}
                            </span>
                        ) : (
                            <Link
                                to={recentItemUrl(item)}
                                onClick={() => onSelect?.(item.id)}
                                className={cn(
                                    "block rounded-lg transition-all px-3 py-2 text-left no-underline hover:bg-brand-soft",
                                    onRemove && "pr-9",
                                )}
                            >
                                {label}
                            </Link>
                        )}
                        {onRemove && (
                            <button
                                type="button"
                                aria-label={`Remove ${item.label || item.id} from recent`}
                                title="Remove from recent"
                                onClick={() => onRemove(item.id)}
                                className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-body hover:bg-brand-soft hover:text-brand"
                            >
                                <CloseIcon className="size-3.5" />
                            </button>
                        )}
                    </li>
                );
            })}
        </ul>
    );
}
