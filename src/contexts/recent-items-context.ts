import { createContext } from "react";
import type { RecentItem } from "../lib/recent";

export interface RecentItemsActions {
    addItem: (id: string, visitedAt?: number, label?: string) => void;
    removeItem: (id: string) => void;
    clearItems: () => void;
}

export const RecentItemsStateContext = createContext<RecentItem[] | null>(
    null,
);
export const RecentItemsActionsContext =
    createContext<RecentItemsActions | null>(null);
