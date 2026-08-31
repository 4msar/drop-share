export type FileSortMode = "newest" | "name";

export interface ArtifactFile {
    name: string;
    size: number;
    uploaded?: string;
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
    /** Whether the artifact has a valid token and requires authorization to mutate. */
    locked: boolean;
    /** Whether the current request (i.e. the current URL's token) is authorized to mutate the artifact. */
    canModify: boolean;
    /** Human-readable label derived at creation time (e.g. the uploaded file/folder name). Absent for legacy artifacts with no metadata. */
    label?: string;
}

interface ListingResponse extends ArtifactListing {
    success: boolean;
    error?: string;
}

export class ArtifactNotFoundError extends Error {}

/** Header carrying the artifact's lock token on mutating requests. Never sent as a form field, so it can't end up logged alongside upload bodies. */
const TOKEN_HEADER = "X-Artifact-Token";

function tokenHeaders(token: string | null): HeadersInit | undefined {
    return token ? { [TOKEN_HEADER]: token } : undefined;
}

/** Appends a token as a `?token=` query param, if present - used to carry it across folder navigation without persisting it anywhere. */
export function withToken(path: string, token: string | null): string {
    return token
        ? `${path}${path.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`
        : path;
}

/** Fetches the immediate children of an artifact directory. */
export async function fetchArtifactListing(
    id: string,
    path: string,
    token: string | null,
): Promise<ArtifactListing> {
    const params = new URLSearchParams();
    if (path !== "") params.set("path", path);
    if (token) params.set("token", token);
    const query = params.toString();
    const response = await fetch(
        `/api/artifact/${encodeURIComponent(id)}${query ? `?${query}` : ""}`,
    );

    if (response.status === 404) {
        throw new ArtifactNotFoundError(
            "This artifact doesn't exist, or was deleted.",
        );
    }

    const body = (await response
        .json()
        .catch(() => null)) as ListingResponse | null;
    if (!response.ok || !body?.success) {
        throw new Error(
            body?.error ||
                `Could not load this artifact (HTTP ${response.status})`,
        );
    }

    return {
        id: body.id,
        path: body.path ?? path,
        files: body.files ?? [],
        directories: body.directories ?? [],
        locked: body.locked ?? false,
        canModify: body.canModify ?? true,
        label: body.label || undefined,
    };
}

export async function deleteArtifact(
    id: string,
    token: string | null,
): Promise<void> {
    const response = await fetch(`/api/artifact/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: tokenHeaders(token),
    });
    if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
            error?: string;
        } | null;
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
    token: string | null,
): Promise<void> {
    const form = new FormData();
    form.set("mode", "directory");
    form.set("id", id);
    for (const file of files) {
        form.append("files", file, `${subPath}${file.name}`);
    }

    const response = await fetch("/api/upload", {
        method: "POST",
        body: form,
        headers: tokenHeaders(token),
    });
    const body = (await response.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
    } | null;
    if (!response.ok || !body?.success) {
        throw new Error(body?.error || "Upload failed.");
    }
}

async function updateArtifact(
    id: string,
    body: Record<string, unknown>,
    token: string | null,
): Promise<{ label?: string; token?: string }> {
    const response = await fetch(`/api/artifact/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...tokenHeaders(token) },
        body: JSON.stringify(body),
    });
    const parsed = (await response.json().catch(() => null)) as {
        success?: boolean;
        label?: string;
        token?: string;
        error?: string;
    } | null;
    if (!response.ok || !parsed?.success) {
        throw new Error(parsed?.error || "Failed to update artifact.");
    }
    return parsed;
}

/**
 * Protects an unprotected artifact, generating its token server-side. The
 * token is returned exactly once - the caller is responsible for showing it
 * to the owner and carrying it forward (e.g. into the URL), since it can
 * never be retrieved again afterward.
 */
export async function lockArtifact(id: string): Promise<string> {
    const { token } = await updateArtifact(id, { lock: true }, null);
    if (!token) throw new Error("Failed to lock artifact.");
    return token;
}

/**
 * Renames an artifact. Allowed by anyone while unprotected; once locked, the
 * caller must supply the artifact's token.
 */
export async function updateArtifactLabel(
    id: string,
    label: string,
    token: string | null,
): Promise<string> {
    const { label: updatedLabel } = await updateArtifact(id, { label }, token);
    return updatedLabel ?? label;
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
export function sortFiles(
    files: ArtifactFile[],
    mode: FileSortMode = "newest",
): ArtifactFile[] {
    return files.slice().sort((a, b) => {
        if (mode === "name") {
            const nameCompare = a.name.localeCompare(b.name);
            if (nameCompare !== 0) return nameCompare;
        }

        const uploadedA = Date.parse(a.uploaded ?? "1970-01-01T00:00:00.000Z");
        const uploadedB = Date.parse(b.uploaded ?? "1970-01-01T00:00:00.000Z");
        const uploadCompare = uploadedB - uploadedA;
        if (uploadCompare !== 0) return uploadCompare;

        return a.name.localeCompare(b.name);
    });
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
export function previewUrl(
    id: string,
    subPath: string,
    file: ArtifactFile,
): string {
    const raw = fileUrl(id, subPath, file.name);
    return file.markdown ? `${raw}?render=html` : raw;
}
