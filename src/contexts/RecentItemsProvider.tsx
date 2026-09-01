import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
    addRecentItem,
    clearRecentItems,
    getRecentItems,
    removeRecentItem,
    type RecentItem,
} from "../lib/recent";
import {
    RecentItemsActionsContext,
    RecentItemsStateContext,
    type RecentItemsActions,
} from "./recent-items-context";

/**
 * Provides the recently-viewed-artifacts list app-wide, backed by
 * `localStorage`. A single shared copy, rather than every consumer (the
 * viewer's switcher, the upload page's drawer) reading `localStorage` and
 * keeping its own state in sync by hand.
 */
export function RecentItemsProvider({ children }: { children: ReactNode }) {
    const [items, setItems] = useState<RecentItem[]>(() => getRecentItems());

    const addItem = useCallback(
        (id: string, visitedAt?: number, label?: string) => {
            setItems(addRecentItem(id, visitedAt, label));
        },
        [],
    );

    const removeItem = useCallback((id: string) => {
        setItems(removeRecentItem(id));
    }, []);

    const clearItems = useCallback(() => {
        clearRecentItems();
        setItems([]);
    }, []);

    const actions = useMemo<RecentItemsActions>(
        () => ({ addItem, removeItem, clearItems }),
        [addItem, removeItem, clearItems],
    );

    return (
        <RecentItemsStateContext value={items}>
            <RecentItemsActionsContext value={actions}>
                {children}
            </RecentItemsActionsContext>
        </RecentItemsStateContext>
    );
}
