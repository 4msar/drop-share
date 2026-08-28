import {
    createArtifactMetadata,
    generateArtifactToken,
    loadArtifactAuth,
    metadataObjectKey,
    serializeArtifactMetadata,
} from "../lib/artifactMeta.js";
import { jsonError, jsonOk } from "../lib/http.js";
import { isValidArtifactId } from "../lib/ids.js";

const METADATA_CONTENT_TYPE = "application/json; charset=utf-8";

/**
 * Generates a token server-side and stores it in the artifact's metadata,
 * protecting future mutations. Rejects an artifact that's already protected
 * (including one whose metadata is malformed - the auth helper already fails
 * that closed as "locked").
 */
export async function handleArtifactLock(id: string, env: Env): Promise<Response> {
    if (!isValidArtifactId(id)) return jsonError(404, "Artifact not found");

    const auth = await loadArtifactAuth(env.ARTIFACTS_BUCKET, id, null);
    if (auth.auth.locked) {
        return jsonError(409, "Artifact is already protected");
    }

    if (auth.metadata === null) {
        // No metadata object at all - could be a legacy artifact (real files,
        // never given one) or an id that was never uploaded to. Only the
        // former may be locked.
        const probe = await env.ARTIFACTS_BUCKET.list({ prefix: `${id}/`, limit: 1 });
        if (probe.objects.length === 0) return jsonError(404, "Artifact not found");
    }

    const token = generateArtifactToken();
    const metadata =
        auth.metadata !== null
            ? { ...auth.metadata, token }
            : { ...createArtifactMetadata(""), token };

    await env.ARTIFACTS_BUCKET.put(metadataObjectKey(id), serializeArtifactMetadata(metadata), {
        httpMetadata: { contentType: METADATA_CONTENT_TYPE },
    });

    const response = jsonOk({
        id,
        token,
        message: "Save this token now - it cannot be shown again.",
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
}
