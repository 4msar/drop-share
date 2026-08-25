import { Link } from "react-router";
import { formatRelativeTime } from "../lib/format";
import type { RecentItem } from "../lib/recent";

interface RecentListProps {
    items: RecentItem[];
    currentId?: string;
    onSelect?: (id: string) => void;
}

export function RecentList({
    items,
    currentId,
    onSelect,
    className = "",
}: RecentListProps & { className?: string }) {
    return (
        <ul className={`flex flex-col p-1 gap-1 ${className}`}>
            {items.map((item) => {
                const isCurrent = item.id === currentId;
                const label = (
                    <>
                        <span className="block truncate text-sm font-medium text-heading">
                            {item.id}
                        </span>
                        <span className="block text-xs text-body">
                            {formatRelativeTime(item.visitedAt)}
                        </span>
                    </>
                );
                return (
                    <li key={item.id}>
                        {isCurrent ? (
                            <span
                                aria-current="page"
                                className="block rounded-lg px-3 py-2 text-left text-brand bg-panel"
                            >
                                {label}
                            </span>
                        ) : (
                            <Link
                                to={`/a/${item.id}/`}
                                onClick={() => onSelect?.(item.id)}
                                className="block rounded-lg transition-all px-3 py-2 text-left no-underline hover:bg-brand-soft"
                            >
                                {label}
                            </Link>
                        )}
                    </li>
                );
            })}
        </ul>
    );
}
