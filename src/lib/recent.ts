export interface RecentItem {
    id: string;
    visitedAt: number;
    /** Human-readable label from the artifact's metadata, if it has one. Shown instead of the id in the recent list. */
    label?: string;
}

export const STORAGE_KEY = "drop-share:recent";

function isRecentItem(value: unknown): value is RecentItem {
    if (typeof value !== "object" || value === null) return false;
    const item = value as RecentItem;
    if (typeof item.id !== "string" || typeof item.visitedAt !== "number") return false;
    return item.label === undefined || typeof item.label === "string";
}

/** Recently viewed artifacts, newest first. */
export function getRecentItems(): RecentItem[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter(isRecentItem) : [];
    } catch {
        return [];
    }
}

/**
 * Records that an artifact was viewed, moving it to the front and refreshing
 * its label (if one is known this time - a legacy artifact fetched before
 * its label was known keeps whatever it had). If storage is full, the oldest
 * entries are dropped until the write fits.
 */
export function addRecentItem(
    id: string,
    visitedAt: number = Date.now(),
    label?: string,
): RecentItem[] {
    const current = getRecentItems();
    const resolvedLabel = label || current.find((item) => item.id === id)?.label;
    const items = [
        { id, visitedAt, ...(resolvedLabel ? { label: resolvedLabel } : {}) },
        ...current.filter((item) => item.id !== id),
    ];
    return persist(items);
}

/** Removes an artifact from recently viewed items. */
export function removeRecentItem(id: string): RecentItem[] {
    return persist(getRecentItems().filter((item) => item.id !== id));
}

function persist(items: RecentItem[]): RecentItem[] {
    let list = items;
    while (list.length > 0) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
            return list;
        } catch {
            list = list.slice(0, -1);
        }
    }
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch {
        // Storage is unavailable; nothing more we can do.
    }
    return [];
}

export const clearRecentItems = () => {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch {
        // Storage is unavailable; nothing more we can do.
    }
};
