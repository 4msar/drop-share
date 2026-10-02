export const ARTIFACT_METADATA_FILENAME = ".artifact.json";

export type ArtifactVisibility = "public" | "private";

export interface ArtifactMetadata {
    label: string;
    createdAt: string;
    token?: string;
    visibility: ArtifactVisibility;
    [key: string]: unknown;
}

export interface ArtifactAuthState {
    locked: boolean;
    canModify: boolean;
    /** Whether the caller may read the artifact at all: always for a public
     * one, only with a matching share or owner token for a private one. */
    readable: boolean;
}

export interface ArtifactAuthResult {
    auth: ArtifactAuthState;
    metadataObject: R2ObjectBody | null;
    metadata: ArtifactMetadata | null;
}

export const UNPROTECTED_AUTH_STATE: ArtifactAuthState = {
    locked: false,
    canModify: true,
    readable: true,
};
/** A metadata file that fails to parse can't tell us whether the artifact
 * is private, so it fails closed on reads too, not just on mutations. */
export const MALFORMED_AUTH_STATE: ArtifactAuthState = {
    locked: true,
    canModify: false,
    readable: false,
};

/** Longest label accepted through the label-update route (trimmed length). */
export const MAX_LABEL_LENGTH = 200;

/** Longest client-supplied lock token accepted through the lock route. */
export const MAX_LOCK_TOKEN_LENGTH = 512;

/** Builds the reserved R2 key for an artifact's hidden metadata object. */
export function metadataObjectKey(artifactId: string): string {
    return `${artifactId}/${ARTIFACT_METADATA_FILENAME}`;
}

/** Creates fresh, unprotected metadata for a newly created artifact. */
export function createArtifactMetadata(
    label: string,
    now: Date = new Date(),
): ArtifactMetadata {
    return { label, createdAt: now.toISOString(), visibility: "public" };
}

/**
 * Best-effort human-readable label for a freshly-created artifact, derived
 * from the relative paths of the files it was created from. Purely
 * informational metadata (never validated, never exposed in public
 * listings), so this is a heuristic, not a contract:
 *  - one file: that file's own path.
 *  - every file shares one top-level folder: that folder's name.
 *  - otherwise (loose files with no common folder): the file count, e.g. "2 files".
 */
export function deriveArtifactLabel(paths: string[]): string {
    if (paths.length === 0) return "";
    if (paths.length === 1) return paths[0];

    const topLevelFolderName = paths[0].split("/")[0];
    if (paths.every((path) => path.startsWith(`${topLevelFolderName}/`))) {
        return topLevelFolderName;
    }

    return `${paths.length} files`;
}

export function getNameWithoutExtension(path: string): string {
    const fileName = path.split("/").pop() ?? "";
    return fileName.replace(/\.[^/.]+$/, "");
}

export function serializeArtifactMetadata(metadata: ArtifactMetadata): string {
    return JSON.stringify(metadata);
}

/**
 * Parses raw metadata JSON, validating only the fields this app reads
 * (`label`, `createdAt`, `token`, `visibility`) and preserving anything else unmodified, so
 * a future field never gets silently dropped on the next read-modify-write.
 * Returns null for anything that fails to parse as JSON, isn't a plain
 * object, or is missing/mistypes a known field - the caller treats that as
 * "malformed metadata" and fails closed.
 */
export function parseArtifactMetadata(raw: string): ArtifactMetadata | null {
    let value: unknown;
    try {
        value = JSON.parse(raw);
    } catch {
        return null;
    }
    if (typeof value !== "object" || value === null || Array.isArray(value))
        return null;

    const record = value as Record<string, unknown>;
    if (
        typeof record.label !== "string" ||
        typeof record.createdAt !== "string"
    )
        return null;
    if (
        record.token !== undefined &&
        (typeof record.token !== "string" || record.token.length === 0)
    ) {
        return null;
    }

    const visibility = record.visibility ?? "public";
    if (visibility !== "public" && visibility !== "private") return null;
    // A private artifact's share token is derived from its owner token, so
    // private without a token is an inconsistent state - fail closed.
    if (visibility === "private" && record.token === undefined) return null;

    const metadata: ArtifactMetadata = {
        ...record,
        label: record.label,
        createdAt: record.createdAt,
        visibility,
    };
    if (record.token !== undefined) metadata.token = record.token as string;
    return metadata;
}

/**
 * Constant-time string comparison: always runs the same number of
 * iterations, and folds a length mismatch into the result instead of
 * returning early, so a failed comparison can't be timed to learn how many
 * leading bytes of a guessed token were correct.
 */
export function timingSafeEqual(a: string, b: string): boolean {
    const aBytes = new TextEncoder().encode(a);
    const bBytes = new TextEncoder().encode(b);
    const length = Math.max(aBytes.length, bBytes.length, 1);
    let diff = aBytes.length ^ bBytes.length;
    for (let i = 0; i < length; i++) {
        diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
    }
    return diff === 0;
}

/**
 * Derives an artifact's read-only share token from its owner (lock) token:
 * SHA-1(ownerToken) as lowercase hex - the same derivation the web client
 * (`src/lib/hash.ts`) and the CLI use. Nothing extra is stored: the server
 * recomputes it from the stored token, and since a hash can't be reversed,
 * holding the share token never grants the owner token's modify access.
 */
export async function deriveShareToken(ownerToken: string): Promise<string> {
    const digest = await crypto.subtle.digest(
        "SHA-1",
        new TextEncoder().encode(ownerToken),
    );
    return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}

/** Derives auth state from metadata that is known to exist and parse successfully. */
export async function deriveAuthStateForMetadata(
    metadata: ArtifactMetadata,
    suppliedToken: string | null,
    suppliedShareToken: string | null = null,
): Promise<ArtifactAuthState> {
    if (metadata.token === undefined) return UNPROTECTED_AUTH_STATE;
    const canModify =
        suppliedToken !== null &&
        timingSafeEqual(suppliedToken, metadata.token);
    let readable = metadata.visibility === "public" || canModify;
    if (!readable && suppliedShareToken !== null) {
        readable = timingSafeEqual(
            suppliedShareToken,
            await deriveShareToken(metadata.token),
        );
    }
    return { locked: true, canModify, readable };
}

/**
 * Loads an artifact's protection state. No metadata object at all means a
 * legacy (pre-feature) or not-yet-created artifact - always unprotected. A
 * metadata object that fails to parse is treated as protected (fails
 * closed), per the spec: a corrupted protection file must never be read as
 * "unlocked".
 */
export async function loadArtifactAuth(
    bucket: R2Bucket,
    artifactId: string,
    suppliedToken: string | null,
    suppliedShareToken: string | null = null,
): Promise<ArtifactAuthResult> {
    const metadataObject = await bucket.get(metadataObjectKey(artifactId));
    if (metadataObject === null) {
        return {
            auth: UNPROTECTED_AUTH_STATE,
            metadataObject: null,
            metadata: null,
        };
    }

    const metadata = parseArtifactMetadata(await metadataObject.text());
    if (metadata === null) {
        return { auth: MALFORMED_AUTH_STATE, metadataObject, metadata: null };
    }

    return {
        auth: await deriveAuthStateForMetadata(
            metadata,
            suppliedToken,
            suppliedShareToken,
        ),
        metadataObject,
        metadata,
    };
}
