const MAX_FILE_NAME_LENGTH = 255;

function slugifySegment(segment: string): string {
    return segment
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

/**
 * Slugifies a file name for a rename: lowercases, strips diacritics, and
 * collapses everything but letters/digits into single hyphens. The base name
 * and extension are slugified separately so the last dot always survives as
 * the extension separator instead of being hyphenated away with the rest of
 * the name (e.g. "My Photo!.PNG" -> "my-photo.png"). Returns null for input
 * that's empty, too long, or slugifies to nothing usable (e.g. a name made
 * entirely of punctuation), so the caller can reject the rename outright
 * rather than write a file with no name.
 */
export function slugifyFileName(rawName: string): string | null {
    const trimmed = rawName.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_FILE_NAME_LENGTH) return null;

    const dotIndex = trimmed.lastIndexOf(".");
    const hasExtension = dotIndex > 0 && dotIndex < trimmed.length - 1;
    const base = hasExtension ? trimmed.slice(0, dotIndex) : trimmed;
    const extension = hasExtension ? trimmed.slice(dotIndex + 1) : "";

    const slugBase = slugifySegment(base);
    if (slugBase.length === 0) return null;

    const slugExtension = extension ? slugifySegment(extension) : "";
    return slugExtension ? `${slugBase}.${slugExtension}` : slugBase;
}
