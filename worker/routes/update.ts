import {
    type ArtifactMetadata,
    type ArtifactVisibility,
    createArtifactMetadata,
    loadArtifactAuth,
    MAX_LABEL_LENGTH,
    MAX_LOCK_TOKEN_LENGTH,
    metadataObjectKey,
    serializeArtifactMetadata,
} from "../lib/artifactMeta.js";
import { jsonError, jsonOk } from "../lib/http.js";
import { isValidArtifactId } from "../lib/ids.js";

const METADATA_CONTENT_TYPE = "application/json; charset=utf-8";

interface ArtifactUpdateRequest {
    label?: unknown;
    lock?: unknown;
    token?: unknown;
    visibility?: unknown;
}

/**
 * Single route for every mutation of an artifact's `.artifact.json`: setting
 * its label, protecting it with a client-supplied token, and/or switching its
 * visibility. Any combination can be requested in the same call. Unlike locking, a label edit is not "one-time" -
 * an unprotected artifact's label can be changed by anyone, same as an
 * unprotected artifact can be uploaded into or deleted by anyone. Once
 * protected, every mutation here - including a later label edit - requires
 * the token.
 */
export async function handleArtifactUpdate(
    id: string,
    env: Env,
    token: string | null,
    body: unknown,
): Promise<Response> {
    if (!isValidArtifactId(id)) return jsonError(404, "Artifact not found");

    const request = (body && typeof body === "object" ? body : {}) as ArtifactUpdateRequest;
    const wantsLock = request.lock === true;
    const wantsLabel = typeof request.label === "string";
    const wantsVisibility = request.visibility !== undefined;
    if (!wantsLock && !wantsLabel && !wantsVisibility) {
        return jsonError(400, "Nothing to update");
    }

    let visibility: ArtifactVisibility | undefined;
    if (wantsVisibility) {
        if (request.visibility !== "public" && request.visibility !== "private") {
            return jsonError(400, 'Visibility must be "public" or "private"');
        }
        visibility = request.visibility;
    }

    let normalizedLabel: string | undefined;
    if (wantsLabel) {
        normalizedLabel = (request.label as string).trim();
        if (normalizedLabel.length === 0 || normalizedLabel.length > MAX_LABEL_LENGTH) {
            return jsonError(400, `Label must be between 1 and ${MAX_LABEL_LENGTH} characters`);
        }
    }

    let lockToken: string | undefined;
    if (wantsLock) {
        if (
            typeof request.token !== "string" ||
            request.token.length === 0 ||
            request.token.length > MAX_LOCK_TOKEN_LENGTH
        ) {
            return jsonError(
                400,
                `A token between 1 and ${MAX_LOCK_TOKEN_LENGTH} characters is required to lock an artifact`,
            );
        }
        lockToken = request.token;
    }

    const auth = await loadArtifactAuth(env.ARTIFACTS_BUCKET, id, token);

    // A private artifact the caller can't read (or malformed metadata, which
    // fails closed) answers exactly like a missing one - never 403/409, which
    // would confirm it exists.
    if (!auth.auth.readable) return jsonError(404, "Artifact not found");

    if (auth.metadata === null) {
        // No metadata object at all - could be a legacy artifact (real files,
        // never given one) or an id that was never uploaded to. Only the
        // former can be updated. Checked before the 409s below so a missing
        // id is always a 404.
        const probe = await env.ARTIFACTS_BUCKET.list({ prefix: `${id}/`, limit: 1 });
        if (probe.objects.length === 0) return jsonError(404, "Artifact not found");
    }

    // Re-locking an already-protected artifact is not a supported operation
    // (there's no token rotation feature) - this mirrors the original lock
    // endpoint's behavior exactly.
    if (wantsLock && auth.auth.locked) return jsonError(409, "Artifact is already protected");
    // Any other mutation on a protected artifact requires proving ownership.
    if (!wantsLock && auth.auth.locked && !auth.auth.canModify) return jsonError(403, "Forbidden");
    // A private artifact's share token is derived from its lock token, so it
    // has to be locked first (or in this same request).
    if (visibility === "private" && !auth.auth.locked && !wantsLock) {
        return jsonError(409, "Lock the artifact before making it private");
    }

    const next: ArtifactMetadata = { ...(auth.metadata ?? createArtifactMetadata("")) };
    if (wantsLabel) next.label = normalizedLabel!;
    if (wantsLock) next.token = lockToken;
    if (visibility !== undefined) next.visibility = visibility;

    // Conditional on the metadata being unchanged since it was read, so two
    // concurrent updates can't silently undo each other (e.g. a label edit
    // reverting a just-applied "private"). R2 returns null when it fails.
    const written = await env.ARTIFACTS_BUCKET.put(
        metadataObjectKey(id),
        serializeArtifactMetadata(next),
        {
            httpMetadata: { contentType: METADATA_CONTENT_TYPE },
            ...(auth.metadataObject
                ? { onlyIf: { etagMatches: auth.metadataObject.etag } }
                : {}),
        },
    );
    if (written === null) {
        return jsonError(409, "The artifact was changed at the same time - please retry");
    }

    const response = jsonOk({
        id,
        label: next.label,
        locked: next.token !== undefined,
        canModify: true,
        visibility: next.visibility,
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
}
