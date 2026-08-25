export interface RecentItem {
    id: string;
    visitedAt: number;
}

export const STORAGE_KEY = "drop-share:recent";

function isRecentItem(value: unknown): value is RecentItem {
    return (
        typeof value === "object" &&
        value !== null &&
        typeof (value as RecentItem).id === "string" &&
        typeof (value as RecentItem).visitedAt === "number"
    );
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
 * Records that an artifact was viewed, moving it to the front. If storage is
 * full, the oldest entries are dropped until the write fits.
 */
export function addRecentItem(
    id: string,
    visitedAt: number = Date.now(),
): RecentItem[] {
    const items = [
        { id, visitedAt },
        ...getRecentItems().filter((item) => item.id !== id),
    ];
    return persist(items);
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
