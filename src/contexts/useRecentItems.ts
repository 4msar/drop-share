import { use } from "react";
import type { RecentItem } from "../lib/recent";
import {
    RecentItemsActionsContext,
    RecentItemsStateContext,
    type RecentItemsActions,
} from "./recent-items-context";

/** The recently-viewed-artifacts list, newest first. */
export function useRecentItems(): RecentItem[] {
    const value = use(RecentItemsStateContext);
    if (value === null) {
        throw new Error("useRecentItems must be used within a RecentItemsProvider");
    }
    return value;
}

/** Actions that mutate the recently-viewed-artifacts list. */
export function useRecentItemsActions(): RecentItemsActions {
    const value = use(RecentItemsActionsContext);
    if (value === null) {
        throw new Error(
            "useRecentItemsActions must be used within a RecentItemsProvider",
        );
    }
    return value;
}
