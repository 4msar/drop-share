import { marked } from "marked";
import {
    getContentType,
    isInlineSafe,
    isScriptCapableDocument,
} from "../lib/contentType.js";
import { escapeHtml, jsonError, jsonOk } from "../lib/http.js";
import { isValidArtifactId } from "../lib/ids.js";
import { normalizeRelativePath } from "../lib/paths.js";
import { deleteArtifact, listArtifactChildren } from "../lib/r2.js";

// Files can now be updated in place (see the artifact re-upload feature), so
// responses must always revalidate rather than being cached as immutable -
// the strong ETag (set alongside this on raw file responses) still makes an
// unchanged file's revalidation a cheap 304.
const FILE_CACHE_CONTROL = "public, max-age=0, must-revalidate";
const MARKDOWN_CONTENT_TYPE = "text/markdown; charset=utf-8";
const SANDBOX_CSP =
    "sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals";

export async function handleArtifactBrowse(
    id: string,
    rawSubPath: string,
    env: Env,
    request: Request,
): Promise<Response> {
    if (!isValidArtifactId(id)) return jsonError(404, "Artifact not found");

    const isDirectoryRequest = rawSubPath === "" || rawSubPath.endsWith("/");
    const relSubPath = rawSubPath.replace(/^\//, "");

    if (isDirectoryRequest) {
        return serveViewerShell(id, relSubPath, env, request);
    }
    return serveFile(id, relSubPath, env, request);
}

/**
 * Normalises a caller-supplied subdirectory path into an R2 prefix segment:
 * "" for the artifact root, otherwise a validated, slash-terminated path.
 * Returns null for anything that escapes the artifact (traversal, absolute
 * paths), which callers turn into a 404.
 */
function normalizeListingPath(rawPath: string | undefined): string | null {
    if (rawPath === undefined || rawPath === "" || rawPath === "/") return "";
    const trimmed = rawPath.replace(/^\/+/, "").replace(/\/+$/, "");
    if (trimmed === "") return "";
    const normalized = normalizeRelativePath(trimmed);
    if (normalized === null) return null;
    return `${normalized}/`;
}

export async function handleArtifactJson(
    id: string,
    env: Env,
    rawPath?: string,
): Promise<Response> {
    if (!isValidArtifactId(id)) return jsonError(404, "Artifact not found");

    const subPath = normalizeListingPath(rawPath);
    if (subPath === null) return jsonError(404, "Artifact not found");

    const listing = await listArtifactChildren(
        env.ARTIFACTS_BUCKET,
        `${id}/${subPath}`,
    );
    if (listing.files.length === 0 && listing.directories.length === 0) {
        return jsonError(404, "Artifact not found");
    }
    const response = jsonOk({
        id,
        url: `/a/${id}/${subPath}`,
        path: subPath,
        files: listing.files.map((file) => {
            const contentType = file.contentType ?? getContentType(file.name);
            return {
                name: file.name,
                size: file.size,
                contentType: file.contentType,
                // The client renders the viewer now, but the decision about
                // what is safe to show inline stays here - duplicating that
                // predicate in the browser would let the two drift apart.
                previewable: isInlineSafe(contentType),
                markdown: contentType === MARKDOWN_CONTENT_TYPE,
            };
        }),
        directories: listing.directories,
    });
    // An artifact's contents can change (see the re-upload feature), and this
    // listing is what the viewer draws itself from - a cached copy would show
    // files that are no longer there.
    response.headers.set("Cache-Control", "no-store");
    return response;
}

export async function handleArtifactDelete(
    id: string,
    env: Env,
): Promise<Response> {
    if (!isValidArtifactId(id)) return jsonError(404, "Artifact not found");
    const deletedCount = await deleteArtifact(env.ARTIFACTS_BUCKET, id);
    if (deletedCount === 0) return jsonError(404, "Artifact not found");
    return jsonOk({ id, deleted: true });
}

/**
 * Directory URLs are pages, so they hand off to the SPA shell and the viewer
 * fetches its listing from the API. The existence probe stays server-side on
 * purpose: without it every `/a/<anything>/` would answer 200, and these URLs
 * get pasted into crawlers, link checkers and chat unfurlers.
 */
async function serveViewerShell(
    id: string,
    relSubPath: string,
    env: Env,
    request: Request,
): Promise<Response> {
    if (
        relSubPath !== "" &&
        normalizeRelativePath(relSubPath.replace(/\/$/, "")) === null
    ) {
        return jsonError(404, "Artifact not found");
    }

    const probe = await env.ARTIFACTS_BUCKET.list({
        prefix: `${id}/${relSubPath}`,
        limit: 1,
    });
    if (probe.objects.length === 0) {
        return jsonError(404, "Artifact not found");
    }

    return env.ASSETS.fetch(request);
}

async function serveFile(
    id: string,
    relSubPath: string,
    env: Env,
    request: Request,
): Promise<Response> {
    const normalizedPath = normalizeRelativePath(relSubPath);
    if (normalizedPath === null) return jsonError(404, "Artifact not found");

    const key = `${id}/${normalizedPath}`;
    const object = await env.ARTIFACTS_BUCKET.get(key);

    if (!object) {
        const probe = await env.ARTIFACTS_BUCKET.list({
            prefix: `${key}/`,
            limit: 1,
        });
        if (probe.objects.length > 0) {
            return Response.redirect(
                `${new URL(request.url).origin}/a/${id}/${normalizedPath}/`,
                301,
            );
        }
        return jsonError(404, "File not found");
    }

    const ifNoneMatch = request.headers.get("if-none-match");
    if (ifNoneMatch !== null && ifNoneMatch === object.httpEtag) {
        return new Response(null, {
            status: 304,
            headers: { "Cache-Control": FILE_CACHE_CONTROL, ETag: object.httpEtag },
        });
    }

    const contentType =
        object.httpMetadata?.contentType ?? getContentType(normalizedPath);
    const filename = normalizedPath.split("/").pop() ?? normalizedPath;

    if (
        contentType === MARKDOWN_CONTENT_TYPE &&
        new URL(request.url).searchParams.get("render") === "html"
    ) {
        return renderMarkdownFile(filename, await object.text(), request.method);
    }

    const dispositionType = isInlineSafe(contentType) ? "inline" : "attachment";

    const headers = new Headers({
        "Content-Type": contentType,
        "Content-Length": String(object.size),
        "Content-Disposition": contentDispositionHeader(
            dispositionType,
            filename,
        ),
        "Cache-Control": FILE_CACHE_CONTROL,
        "X-Content-Type-Options": "nosniff",
        ETag: object.httpEtag,
    });

    if (isScriptCapableDocument(contentType)) {
        // HTML/SVG render inline (so uploaded sites/pages actually work), but any
        // embedded script only ever runs inside a sandboxed, opaque origin - no
        // access to this site's origin, same as if it were on a totally
        // different domain. Omitting allow-same-origin is what makes that hold.
        headers.set("Content-Security-Policy", SANDBOX_CSP);
    }

    if (request.method === "HEAD") {
        return new Response(null, { status: 200, headers });
    }
    return new Response(object.body, { status: 200, headers });
}

function contentDispositionHeader(
    type: "inline" | "attachment",
    filename: string,
): string {
    const asciiFallback = filename
        .replace(/[\r\n"\\]/g, "_")
        .replace(/[^\x20-\x7e]/g, "_");
    const encoded = encodeURIComponent(filename);
    return `${type}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

/**
 * Renders a markdown file's contents as a standalone HTML page for the preview
 * iframe. This stays server-side deliberately: markdown can embed raw HTML and
 * <script>, so rendering it in the React app would run that script on this
 * site's own origin. Here it inherits the same sandbox CSP as uploaded HTML.
 */
function renderMarkdownFile(
    filename: string,
    markdownSource: string,
    method: string,
): Response {
    const bodyHtml = marked.parse(markdownSource, { async: false }) as string;
    const page = renderMarkdownPreviewPage(filename, bodyHtml);
    const headers = new Headers({
        "Content-Type": "text/html; charset=utf-8",
        // This response is derived from R2 content that can now change (see the
        // artifact update feature), and markdown can embed raw HTML/<script>, so
        // it gets the same sandbox CSP as uploaded HTML/SVG - the browser has
        // already committed to running it as HTML.
        "Cache-Control": FILE_CACHE_CONTROL,
        "Content-Security-Policy": SANDBOX_CSP,
    });
    if (method === "HEAD") return new Response(null, { status: 200, headers });
    return new Response(page, { status: 200, headers });
}

function renderMarkdownPreviewPage(filename: string, bodyHtml: string): string {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(filename)}</title>
<style>
  :root {
    --bg: #fff; --text: #374151; --text-h: #111827; --border: #e5e7eb; --code-bg: #f3f4f6;
    color-scheme: light dark;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #16171d; --text: #cbd5e1; --text-h: #f3f4f6; --border: #30323c; --code-bg: #1f2028; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px; font: 16px/1.6 system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--text); }
  main { max-width: 720px; margin: 0 auto; }
  h1, h2, h3, h4, h5, h6 { color: var(--text-h); }
  a { color: inherit; }
  pre { background: var(--code-bg); padding: 12px; border-radius: 6px; overflow-x: auto; }
  code { background: var(--code-bg); padding: 0.15em 0.35em; border-radius: 4px; font-size: 0.9em; }
  pre code { background: none; padding: 0; }
  blockquote { margin: 0; padding-left: 16px; border-left: 3px solid var(--border); }
  img { max-width: 100%; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid var(--border); padding: 6px 10px; text-align: left; }
</style>
</head>
<body>
<main>${bodyHtml}</main>
</body>
</html>`;
}
