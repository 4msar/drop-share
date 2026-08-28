export const ARTIFACT_METADATA_FILENAME = ".artifact.json";

export interface ArtifactMetadata {
  label: string;
  createdAt: string;
  token?: string;
  [key: string]: unknown;
}

export interface ArtifactAuthState {
  locked: boolean;
  canModify: boolean;
}

export interface ArtifactAuthResult {
  auth: ArtifactAuthState;
  metadataObject: R2ObjectBody | null;
  metadata: ArtifactMetadata | null;
}

export const UNPROTECTED_AUTH_STATE: ArtifactAuthState = { locked: false, canModify: true };
export const MALFORMED_AUTH_STATE: ArtifactAuthState = { locked: true, canModify: false };

const TOKEN_BYTE_LENGTH = 32;

/** Builds the reserved R2 key for an artifact's hidden metadata object. */
export function metadataObjectKey(artifactId: string): string {
  return `${artifactId}/${ARTIFACT_METADATA_FILENAME}`;
}

/** Creates fresh, unprotected metadata for a newly created artifact. */
export function createArtifactMetadata(label: string, now: Date = new Date()): ArtifactMetadata {
  return { label, createdAt: now.toISOString() };
}

export function serializeArtifactMetadata(metadata: ArtifactMetadata): string {
  return JSON.stringify(metadata);
}

/**
 * Parses raw metadata JSON, validating only the fields this app reads
 * (`label`, `createdAt`, `token`) and preserving anything else unmodified, so
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
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;

  const record = value as Record<string, unknown>;
  if (typeof record.label !== "string" || typeof record.createdAt !== "string") return null;
  if (record.token !== undefined && (typeof record.token !== "string" || record.token.length === 0)) {
    return null;
  }

  const metadata: ArtifactMetadata = { ...record, label: record.label, createdAt: record.createdAt };
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

/** Generates a 256-bit, URL-safe, server-side-only lock token. */
export function generateArtifactToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTE_LENGTH);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Derives auth state from metadata that is known to exist and parse successfully. */
export function deriveAuthStateForMetadata(
  metadata: ArtifactMetadata,
  suppliedToken: string | null,
): ArtifactAuthState {
  if (metadata.token === undefined) return UNPROTECTED_AUTH_STATE;
  return {
    locked: true,
    canModify: suppliedToken !== null && timingSafeEqual(suppliedToken, metadata.token),
  };
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
): Promise<ArtifactAuthResult> {
  const metadataObject = await bucket.get(metadataObjectKey(artifactId));
  if (metadataObject === null) {
    return { auth: UNPROTECTED_AUTH_STATE, metadataObject: null, metadata: null };
  }

  const metadata = parseArtifactMetadata(await metadataObject.text());
  if (metadata === null) {
    return { auth: MALFORMED_AUTH_STATE, metadataObject, metadata: null };
  }

  return { auth: deriveAuthStateForMetadata(metadata, suppliedToken), metadataObject, metadata };
}
