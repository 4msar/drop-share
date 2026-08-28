import { Hono } from "hono";
import { jsonError } from "./lib/http.js";
import { handleArtifactBrowse, handleArtifactDelete, handleArtifactJson } from "./routes/browse.js";
import { handleHealth } from "./routes/health.js";
import { handleArtifactUpdate } from "./routes/update.js";
import { handleUpload } from "./routes/upload.js";

const app = new Hono<{ Bindings: Env }>();

// Hono answers a matched path with the wrong method as 404. These routes
// answer 405, so each one pairs its verb with an explicit catch-all.
const methodNotAllowed = () => jsonError(405, "Method not allowed");

app.get("/api/health", () => handleHealth());
app.all("/api/health", methodNotAllowed);

app.post("/api/upload", (c) => handleUpload(c.req.raw, c.env));
app.all("/api/upload", methodNotAllowed);

app.get("/api/artifact/:id", (c) =>
  handleArtifactJson(c.req.param("id"), c.env, c.req.query("path"), c.req.query("token") ?? null),
);
app.delete("/api/artifact/:id", (c) =>
  handleArtifactDelete(c.req.param("id"), c.env, c.req.header("X-Artifact-Token") ?? null),
);
app.patch("/api/artifact/:id", async (c) => {
  const body = await c.req.json().catch(() => null);
  return handleArtifactUpdate(c.req.param("id"), c.env, c.req.header("X-Artifact-Token") ?? null, body);
});
app.all("/api/artifact/:id", methodNotAllowed);

// `/a/<id>` with no trailing slash resolves the same way `/a/<id>/` does, so
// both shapes are registered.
const ARTIFACT_BROWSE_PATTERN = /^\/a\/([^/]+)(\/.*)?$/;

function browse(request: Request, env: Env): Promise<Response> | Response {
  const match = new URL(request.url).pathname.match(ARTIFACT_BROWSE_PATTERN);
  if (!match) return jsonError(404, "Artifact not found");

  let subPath: string;
  try {
    // pathname leaves non-ASCII characters (and other percent-encoded bytes)
    // encoded; decode once here so downstream path validation and R2 keys
    // operate on the real unicode text that was stored. Reading the raw
    // pathname rather than Hono's param helpers keeps that single decode -
    // and the deliberate 404 on malformed input - exactly as it was.
    subPath = match[2] ? decodeURIComponent(match[2]) : "";
  } catch {
    return jsonError(404, "Artifact not found");
  }

  return handleArtifactBrowse(match[1], subPath, env, request);
}

app.on(["GET", "HEAD"], ["/a/:id", "/a/:id/*"], (c) => browse(c.req.raw, c.env));
// An array of paths is only supported by app.on(), not by the app.all()
// shortcut, so the two shapes are registered separately here.
app.all("/a/:id", methodNotAllowed);
app.all("/a/:id/*", methodNotAllowed);

app.all("/api/*", () => jsonError(404, "Not found"));

app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

app.onError((error) => {
  console.error("unhandled error:", error instanceof Error ? error.message : "unknown error");
  return jsonError(500, "Internal server error");
});

export default app satisfies ExportedHandler<Env>;
