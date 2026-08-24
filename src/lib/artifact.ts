export interface ArtifactFile {
  name: string;
  size: number;
  contentType?: string;
  /**
   * Whether this file is safe to show in the preview iframe. Decided by the
   * Worker, not here - re-implementing that predicate in the browser is how
   * the two copies would drift apart.
   */
  previewable: boolean;
  markdown: boolean;
}

export interface ArtifactListing {
  id: string;
  path: string;
  files: ArtifactFile[];
  directories: string[];
}

interface ListingResponse extends ArtifactListing {
  success: boolean;
  error?: string;
}

export class ArtifactNotFoundError extends Error {}

/** Fetches the immediate children of an artifact directory. */
export async function fetchArtifactListing(
  id: string,
  path: string,
): Promise<ArtifactListing> {
  const query = path === "" ? "" : `?path=${encodeURIComponent(path)}`;
  const response = await fetch(`/api/artifact/${encodeURIComponent(id)}${query}`);

  if (response.status === 404) {
    throw new ArtifactNotFoundError("This artifact doesn't exist, or was deleted.");
  }

  const body = (await response.json().catch(() => null)) as ListingResponse | null;
  if (!response.ok || !body?.success) {
    throw new Error(body?.error || `Could not load this artifact (HTTP ${response.status})`);
  }

  return {
    id: body.id,
    path: body.path ?? path,
    files: body.files ?? [],
    directories: body.directories ?? [],
  };
}

export async function deleteArtifact(id: string): Promise<void> {
  const response = await fetch(`/api/artifact/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || "Failed to delete artifact.");
  }
}

/**
 * Adds files to an existing artifact, at the directory currently being viewed.
 * Paths are prefixed with the sub-path so a file dropped into a subfolder
 * lands there rather than at the artifact root.
 */
export async function uploadIntoArtifact(
  id: string,
  subPath: string,
  files: File[],
): Promise<void> {
  const form = new FormData();
  form.set("mode", "directory");
  form.set("id", id);
  for (const file of files) {
    form.append("files", file, `${subPath}${file.name}`);
  }

  const response = await fetch("/api/upload", { method: "POST", body: form });
  const body = (await response.json().catch(() => null)) as
    | { success?: boolean; error?: string }
    | null;
  if (!response.ok || !body?.success) {
    throw new Error(body?.error || "Upload failed.");
  }
}

/**
 * Which file the preview pane opens with: index.html if the directory has one,
 * otherwise the first previewable file.
 */
export function pickDefaultPreview(files: ArtifactFile[]): ArtifactFile | null {
  const previewable = files.filter((file) => file.previewable);
  if (previewable.length === 0) return null;
  return (
    previewable.find((file) => file.name.toLowerCase() === "index.html") ??
    previewable[0]
  );
}

/** Sorts a directory's children the way the sidebar lists them. */
export function sortFiles(files: ArtifactFile[]): ArtifactFile[] {
  return files.slice().sort((a, b) => a.name.localeCompare(b.name));
}

/** The sub-path of the parent directory, or null at the artifact root. */
export function parentPath(subPath: string): string | null {
  if (subPath === "") return null;
  const trimmed = subPath.replace(/\/$/, "");
  if (!trimmed.includes("/")) return "";
  return `${trimmed.slice(0, trimmed.lastIndexOf("/"))}/`;
}

/** The URL that serves a file's raw bytes. */
export function fileUrl(id: string, subPath: string, name: string): string {
  return `/a/${id}/${subPath}${name}`;
}

/**
 * The URL the preview iframe points at. Markdown gets the Worker's rendered
 * form; everything else previews its raw bytes.
 */
export function previewUrl(id: string, subPath: string, file: ArtifactFile): string {
  const raw = fileUrl(id, subPath, file.name);
  return file.markdown ? `${raw}?render=html` : raw;
}
