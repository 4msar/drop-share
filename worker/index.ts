import { jsonError } from "./lib/http.js";
import { handleArtifactBrowse, handleArtifactDelete, handleArtifactJson } from "./routes/browse.js";
import { handleHealth } from "./routes/health.js";
import { handleUpload } from "./routes/upload.js";

const ARTIFACT_API_PATTERN = /^\/api\/artifact\/([^/]+)$/;
const ARTIFACT_BROWSE_PATTERN = /^\/a\/([^/]+)(\/.*)?$/;

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;

  if (pathname === "/api/health") {
    return request.method === "GET" ? handleHealth() : jsonError(405, "Method not allowed");
  }

  if (pathname === "/api/upload") {
    return request.method === "POST" ? handleUpload(request, env) : jsonError(405, "Method not allowed");
  }

  const artifactApiMatch = pathname.match(ARTIFACT_API_PATTERN);
  if (artifactApiMatch) {
    const id = artifactApiMatch[1];
    if (request.method === "GET") return handleArtifactJson(id, env);
    if (request.method === "DELETE") return handleArtifactDelete(id, env);
    return jsonError(405, "Method not allowed");
  }

  const browseMatch = pathname.match(ARTIFACT_BROWSE_PATTERN);
  if (browseMatch) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return jsonError(405, "Method not allowed");
    }
    const id = browseMatch[1];
    let subPath: string;
    try {
      // pathname leaves non-ASCII characters (and other percent-encoded
      // bytes) encoded; decode once here so downstream path validation
      // and R2 keys operate on the real unicode text that was stored.
      subPath = browseMatch[2] ? decodeURIComponent(browseMatch[2]) : "";
    } catch {
      return jsonError(404, "Artifact not found");
    }
    return handleArtifactBrowse(id, subPath, env, request);
  }

  if (pathname.startsWith("/api/")) {
    return jsonError(404, "Not found");
  }

  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request, env): Promise<Response> {
    try {
      return await route(request, env);
    } catch (error) {
      console.error("unhandled error:", error instanceof Error ? error.message : "unknown error");
      return jsonError(500, "Internal server error");
    }
  },
} satisfies ExportedHandler<Env>;
