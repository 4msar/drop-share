export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unitIndex]}`;
}

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "ico"]);
const ARCHIVE_EXTENSIONS = new Set(["zip", "gz", "tar"]);

/** A glyph hint for a file row in the viewer sidebar. Cosmetic only. */
export function fileIcon(name: string): string {
  const extension = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  if (IMAGE_EXTENSIONS.has(extension)) return "🖼️";
  if (ARCHIVE_EXTENSIONS.has(extension)) return "🗜️";
  if (extension === "pdf") return "📕";
  return "📄";
}

export function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
