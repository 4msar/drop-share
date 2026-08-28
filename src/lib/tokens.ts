export const TOKENS_STORAGE_KEY = "drop-share:tokens";

function readTokenMap(): Record<string, string> {
    try {
        const raw = localStorage.getItem(TOKENS_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
            ? (parsed as Record<string, string>)
            : {};
    } catch {
        return {};
    }
}

function writeTokenMap(map: Record<string, string>): void {
    try {
        localStorage.setItem(TOKENS_STORAGE_KEY, JSON.stringify(map));
    } catch {
        // Storage is unavailable or full; nothing more we can do.
    }
}

/** The token saved for an artifact after locking it in this browser, if any. */
export function getStoredToken(id: string): string | null {
    const token = readTokenMap()[id];
    return typeof token === "string" && token.length > 0 ? token : null;
}

/**
 * Saves the token generated when locking an artifact, so this browser keeps
 * the ability to modify it later without the owner having to hold onto the
 * token or keep it in the URL themselves.
 */
export function saveToken(id: string, token: string): void {
    const map = readTokenMap();
    map[id] = token;
    writeTokenMap(map);
}

/** Removes a stored token - e.g. once its artifact has been deleted. */
export function removeToken(id: string): void {
    const map = readTokenMap();
    if (!(id in map)) return;
    delete map[id];
    writeTokenMap(map);
}
