import {
    type ArtifactMetadata,
    createArtifactMetadata,
    generateArtifactToken,
    loadArtifactAuth,
    MAX_LABEL_LENGTH,
    metadataObjectKey,
    serializeArtifactMetadata,
} from "../lib/artifactMeta.js";
import { jsonError, jsonOk } from "../lib/http.js";
import { isValidArtifactId } from "../lib/ids.js";

const METADATA_CONTENT_TYPE = "application/json; charset=utf-8";

interface ArtifactUpdateRequest {
    label?: unknown;
    lock?: unknown;
}

/**
 * Single route for every mutation of an artifact's `.artifact.json`: setting
 * its label and/or protecting it with a server-generated token. Both can be
 * requested in the same call. Unlike locking, a label edit is not "one-time" -
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
    if (!wantsLock && !wantsLabel) return jsonError(400, "Nothing to update");

    let normalizedLabel: string | undefined;
    if (wantsLabel) {
        normalizedLabel = (request.label as string).trim();
        if (normalizedLabel.length === 0 || normalizedLabel.length > MAX_LABEL_LENGTH) {
            return jsonError(400, `Label must be between 1 and ${MAX_LABEL_LENGTH} characters`);
        }
    }

    const auth = await loadArtifactAuth(env.ARTIFACTS_BUCKET, id, token);

    // Re-locking an already-protected artifact is not a supported operation
    // (there's no token rotation feature) - this mirrors the original lock
    // endpoint's behavior exactly, including for malformed metadata, which
    // fails closed as "locked".
    if (wantsLock && auth.auth.locked) return jsonError(409, "Artifact is already protected");
    // Any other mutation on a protected artifact requires proving ownership.
    if (!wantsLock && auth.auth.locked && !auth.auth.canModify) return jsonError(403, "Forbidden");

    if (auth.metadata === null) {
        // No metadata object at all - could be a legacy artifact (real files,
        // never given one) or an id that was never uploaded to. Only the
        // former can be updated.
        const probe = await env.ARTIFACTS_BUCKET.list({ prefix: `${id}/`, limit: 1 });
        if (probe.objects.length === 0) return jsonError(404, "Artifact not found");
    }

    const next: ArtifactMetadata = { ...(auth.metadata ?? createArtifactMetadata("")) };
    if (wantsLabel) next.label = normalizedLabel!;
    let newToken: string | undefined;
    if (wantsLock) {
        newToken = generateArtifactToken();
        next.token = newToken;
    }

    await env.ARTIFACTS_BUCKET.put(metadataObjectKey(id), serializeArtifactMetadata(next), {
        httpMetadata: { contentType: METADATA_CONTENT_TYPE },
    });

    const response = jsonOk({
        id,
        label: next.label,
        locked: next.token !== undefined,
        canModify: true,
        ...(newToken
            ? { token: newToken, message: "Save this token now - it cannot be shown again." }
            : {}),
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
}
