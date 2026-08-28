import { isValidArtifactId } from "./ids.js";

const MAX_PATH_LENGTH = 1024;

/**
 * Normalizes a client-supplied relative file path into a safe, POSIX-style
 * path with no way to escape the artifact's own directory. Returns null for
 * anything unsafe (absolute paths, drive letters, traversal, control
 * characters, directory-only paths) rather than throwing, since malicious
 * paths are expected input from untrusted clients, not exceptional cases.
 */
export function normalizeRelativePath(rawPath: string): string | null {
  if (rawPath.length === 0 || rawPath.length > MAX_PATH_LENGTH) return null;
  if (rawPath.endsWith("/")) return null;
  if (rawPath.includes("\\")) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f]/.test(rawPath)) return null;
  if (rawPath.startsWith("/")) return null;
  if (/^[a-zA-Z]:/.test(rawPath)) return null;

  const segments = rawPath.split("/");
  const safeSegments: string[] = [];
  for (const segment of segments) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") return null;
    safeSegments.push(segment);
  }

  if (safeSegments.length === 0) return null;
  return safeSegments.join("/");
}

/**
 * Whether any segment of an already-normalized relative path is dot-prefixed
 * (e.g. the reserved `.artifact.json` metadata marker, or any hidden
 * directory). Used to keep hidden objects out of public listings and direct
 * file serving, regardless of how deep they're nested.
 */
export function hasHiddenSegment(path: string): boolean {
  return path.split("/").some((segment) => segment.startsWith("."));
}

/** Builds the R2 object key for a file within an artifact, validating both parts. */
export function buildObjectKey(artifactId: string, rawPath: string): string {
  if (!isValidArtifactId(artifactId)) {
    throw new Error(`Invalid artifact id: ${artifactId}`);
  }
  const normalized = normalizeRelativePath(rawPath);
  if (normalized === null) {
    throw new Error(`Unsafe relative path: ${rawPath}`);
  }
  return `${artifactId}/${normalized}`;
}
