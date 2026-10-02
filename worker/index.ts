import { Hono } from "hono";
import { jsonError } from "./lib/http.js";
import {
    handleArtifactBrowse,
    handleArtifactDelete,
    handleArtifactDownload,
    handleArtifactJson,
    handleArtifactRename,
    withNotFoundPage,
} from "./routes/browse.js";
import { handleHealth } from "./routes/health.js";
import { handleArtifactUpdate } from "./routes/update.js";
import { handleUpload } from "./routes/upload.js";

// Hono answers a matched path with the wrong method as 404. These routes
// answer 405, so each one pairs its verb with an explicit catch-all.
const methodNotAllowed = () => jsonError(405, "Method not allowed");

function registerApiRoutes(app: Hono<{ Bindings: Env }>) {
    app.get("/api/health", () => handleHealth());
    app.all("/api/health", methodNotAllowed);

    app.post("/api/upload", (c) => handleUpload(c.req.raw, c.env));
    app.all("/api/upload", methodNotAllowed);

    // Registered before the bare `/api/artifact/:id` routes so this deeper path
    // is matched by its own handler rather than the `/api/*` catch-all.
    app.get("/api/artifact/:id/download", (c) =>
        handleArtifactDownload(
            c.req.param("id"),
            c.env,
            c.req.header("X-Artifact-Token") ?? c.req.query("token") ?? null,
            c.req.query("share") ?? null,
        ),
    );
    app.all("/api/artifact/:id/download", methodNotAllowed);

    // Also registered before the bare `/api/artifact/:id` routes, same reason
    // as `/download` above.
    app.patch("/api/artifact/:id/file", async (c) => {
        const body = await c.req.json().catch(() => null);
        return handleArtifactRename(
            c.req.param("id"),
            c.env,
            c.req.header("X-Artifact-Token") ?? null,
            body,
        );
    });
    app.all("/api/artifact/:id/file", methodNotAllowed);

    app.get("/api/artifact/:id", (c) =>
        handleArtifactJson(
            c.req.param("id"),
            c.env,
            c.req.query("path"),
            c.req.query("token") ?? null,
            c.req.query("share") ?? null,
        ),
    );

    app.delete("/api/artifact/:id", (c) =>
        handleArtifactDelete(
            c.req.param("id"),
            c.env,
            c.req.header("X-Artifact-Token") ?? null,
            c.req.query("path") ?? null,
        ),
    );

    app.patch("/api/artifact/:id", async (c) => {
        const body = await c.req.json().catch(() => null);
        return handleArtifactUpdate(
            c.req.param("id"),
            c.env,
            c.req.header("X-Artifact-Token") ?? null,
            body,
        );
    });

    app.all("/api/artifact/:id", methodNotAllowed);
    app.all("/api/*", () => jsonError(404, "Not found"));
}

// `/a/<id>` with no trailing slash resolves the same way `/a/<id>/` does, so
// both shapes are registered.
const ARTIFACT_BROWSE_PATTERN = /^\/a\/([^/]+)(\/.*)?$/;

// `/s/<id>[.<shareToken>]/...` - the read-only share route. A ULID never
// contains `.`, so splitting the first segment on it is unambiguous.
const SHARE_BROWSE_PATTERN = /^\/s\/([^/.]+)(?:\.([^/]+))?(\/.*)?$/;

/** Decodes a browse sub-path once, or null for malformed percent-encoding. */
function decodeSubPath(rawSubPath: string | undefined): string | null {
    try {
        // pathname leaves non-ASCII characters (and other percent-encoded bytes)
        // encoded; decode once here so downstream path validation and R2 keys
        // operate on the real unicode text that was stored. Reading the raw
        // pathname rather than Hono's param helpers keeps that single decode -
        // and the deliberate 404 on malformed input - exactly as it was.
        return rawSubPath ? decodeURIComponent(rawSubPath) : "";
    } catch {
        return null;
    }
}

function browse(request: Request, env: Env): Promise<Response> | Response {
    const match = new URL(request.url).pathname.match(ARTIFACT_BROWSE_PATTERN);
    if (!match) return jsonError(404, "Artifact not found");

    const subPath = decodeSubPath(match[2]);
    if (subPath === null) return jsonError(404, "Artifact not found");

    return handleArtifactBrowse(match[1], subPath, env, request);
}

function shareBrowse(request: Request, env: Env): Promise<Response> | Response {
    const match = new URL(request.url).pathname.match(SHARE_BROWSE_PATTERN);
    if (!match) return jsonError(404, "Artifact not found");

    const [, id, shareToken, rawSubPath] = match;
    const subPath = decodeSubPath(rawSubPath);
    if (subPath === null) return jsonError(404, "Artifact not found");

    const segment = shareToken ? `${id}.${shareToken}` : id;
    return handleArtifactBrowse(id, subPath, env, request, {
        basePath: `/s/${segment}/`,
        shareToken: shareToken ?? null,
        shared: true,
    });
}

function registerArtifactBrowseRoutes(app: Hono<{ Bindings: Env }>) {
    app.on(["GET", "HEAD"], ["/a/:id", "/a/:id/*"], async (c) =>
        withNotFoundPage(await browse(c.req.raw, c.env), c.req.raw, c.env),
    );

    // An array of paths is only supported by app.on(), not by the app.all()
    // shortcut, so the two shapes are registered separately here.
    app.all("/a/:id", methodNotAllowed);
    app.all("/a/:id/*", methodNotAllowed);

    app.on(["GET", "HEAD"], ["/s/:seg", "/s/:seg/*"], async (c) =>
        withNotFoundPage(
            await shareBrowse(c.req.raw, c.env),
            c.req.raw,
            c.env,
        ),
    );
    app.all("/s/:seg", methodNotAllowed);
    app.all("/s/:seg/*", methodNotAllowed);
}

function registerFallbackRoutes(app: Hono<{ Bindings: Env }>) {
    app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));
}

function createApp() {
    const app = new Hono<{ Bindings: Env }>();

    registerApiRoutes(app);
    registerArtifactBrowseRoutes(app);
    registerFallbackRoutes(app);

    app.onError((error) => {
        console.error(
            "unhandled error:",
            error instanceof Error ? error.message : "unknown error",
        );
        return jsonError(500, "Internal server error");
    });

    return app;
}

export default createApp() satisfies ExportedHandler<Env>;
