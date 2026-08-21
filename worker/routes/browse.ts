import { getContentType, isInlineSafe } from "../lib/contentType.js";
import { escapeHtml, jsonError, jsonOk } from "../lib/http.js";
import { isValidArtifactId } from "../lib/ids.js";
import { normalizeRelativePath } from "../lib/paths.js";
import { type ArtifactChild, type ArtifactListing, deleteArtifact, listArtifactChildren } from "../lib/r2.js";

const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";

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
    return renderDirectory(id, relSubPath, env, request);
  }
  return serveFile(id, relSubPath, env, request);
}

export async function handleArtifactJson(id: string, env: Env): Promise<Response> {
  if (!isValidArtifactId(id)) return jsonError(404, "Artifact not found");
  const listing = await listArtifactChildren(env.ARTIFACTS_BUCKET, `${id}/`);
  if (listing.files.length === 0 && listing.directories.length === 0) {
    return jsonError(404, "Artifact not found");
  }
  return jsonOk({
    id,
    url: `/a/${id}/`,
    files: listing.files.map((file) => ({ name: file.name, size: file.size, contentType: file.contentType })),
    directories: listing.directories,
  });
}

export async function handleArtifactDelete(id: string, env: Env): Promise<Response> {
  if (!isValidArtifactId(id)) return jsonError(404, "Artifact not found");
  const deletedCount = await deleteArtifact(env.ARTIFACTS_BUCKET, id);
  if (deletedCount === 0) return jsonError(404, "Artifact not found");
  return jsonOk({ id, deleted: true });
}

async function renderDirectory(id: string, relSubPath: string, env: Env, request: Request): Promise<Response> {
  if (relSubPath !== "" && normalizeRelativePath(relSubPath.replace(/\/$/, "")) === null) {
    return jsonError(404, "Artifact not found");
  }

  const prefix = `${id}/${relSubPath}`;
  const listing = await listArtifactChildren(env.ARTIFACTS_BUCKET, prefix);

  if (listing.files.length === 0 && listing.directories.length === 0) {
    return jsonError(404, "Artifact not found");
  }

  const isRoot = relSubPath === "";
  const html =
    isRoot && listing.files.length === 1 && listing.directories.length === 0
      ? renderSingleFilePage(id, listing.files[0])
      : renderDirectoryPage(id, relSubPath, listing);

  return htmlResponse(html, request.method);
}

async function serveFile(id: string, relSubPath: string, env: Env, request: Request): Promise<Response> {
  const normalizedPath = normalizeRelativePath(relSubPath);
  if (normalizedPath === null) return jsonError(404, "Artifact not found");

  const key = `${id}/${normalizedPath}`;
  const object = await env.ARTIFACTS_BUCKET.get(key);

  if (!object) {
    const probe = await env.ARTIFACTS_BUCKET.list({ prefix: `${key}/`, limit: 1 });
    if (probe.objects.length > 0) {
      return Response.redirect(`${new URL(request.url).origin}/a/${id}/${normalizedPath}/`, 301);
    }
    return jsonError(404, "File not found");
  }

  const contentType = object.httpMetadata?.contentType ?? getContentType(normalizedPath);
  const filename = normalizedPath.split("/").pop() ?? normalizedPath;
  const dispositionType = isInlineSafe(contentType) ? "inline" : "attachment";

  const headers = new Headers({
    "Content-Type": contentType,
    "Content-Length": String(object.size),
    "Content-Disposition": contentDispositionHeader(dispositionType, filename),
    "Cache-Control": IMMUTABLE_CACHE_CONTROL,
    "X-Content-Type-Options": "nosniff",
    ETag: object.httpEtag,
  });

  if (request.method === "HEAD") {
    return new Response(null, { status: 200, headers });
  }
  return new Response(object.body, { status: 200, headers });
}

function contentDispositionHeader(type: "inline" | "attachment", filename: string): string {
  const asciiFallback = filename.replace(/[\r\n"\\]/g, "_").replace(/[^\x20-\x7e]/g, "_");
  const encoded = encodeURIComponent(filename);
  return `${type}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

function htmlResponse(html: string, method: string): Response {
  const headers = new Headers({
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  if (method === "HEAD") return new Response(null, { status: 200, headers });
  return new Response(html, { status: 200, headers });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unitIndex]}`;
}

function fileIcon(name: string): string {
  const extension = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "ico"].includes(extension)) return "🖼️";
  if (["zip", "gz", "tar"].includes(extension)) return "🗜️";
  if (extension === "pdf") return "📕";
  return "📄";
}

const DELETE_SCRIPT = `
<script>
  document.querySelectorAll('[data-delete-artifact]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this artifact permanently? This cannot be undone.')) return;
      const id = btn.getAttribute('data-delete-artifact');
      const res = await fetch('/api/artifact/' + id, { method: 'DELETE' });
      if (res.ok) {
        document.body.innerHTML = '<p>Artifact deleted.</p>';
      } else {
        alert('Failed to delete artifact.');
      }
    });
  });
</script>`;

function pageShell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 16px/1.5 system-ui, -apple-system, sans-serif; max-width: 720px; margin: 0 auto; padding: 32px 20px; }
  h1 { font-size: 20px; word-break: break-all; margin-bottom: 4px; }
  .meta { color: #6b7280; font-size: 14px; margin: 0 0 24px; }
  ul.listing { list-style: none; padding: 0; margin: 0; border-top: 1px solid #e5e7eb; }
  ul.listing li { display: flex; align-items: center; gap: 10px; padding: 10px 4px; border-bottom: 1px solid #e5e7eb; }
  ul.listing a { flex: 1; text-decoration: none; color: inherit; word-break: break-all; }
  ul.listing a:hover { text-decoration: underline; }
  .size { color: #6b7280; font-size: 13px; white-space: nowrap; }
  .icon { width: 1.25em; text-align: center; }
  .actions { margin-top: 24px; display: flex; gap: 12px; }
  .btn { display: inline-block; padding: 8px 16px; border-radius: 6px; border: 1px solid #d1d5db; text-decoration: none; color: inherit; cursor: pointer; background: none; font-size: 14px; font-family: inherit; }
  .btn.danger { border-color: #ef4444; color: #ef4444; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

function renderDirectoryPage(id: string, subPath: string, listing: ArtifactListing): string {
  const base = `/a/${id}/`;
  const currentPath = `${base}${subPath}`;
  const isRoot = subPath === "";

  const parentLink = isRoot
    ? ""
    : (() => {
        const trimmed = subPath.replace(/\/$/, "");
        const parentSubPath = trimmed.includes("/") ? `${trimmed.slice(0, trimmed.lastIndexOf("/"))}/` : "";
        return `<li><span class="icon">⬆️</span><a href="${escapeHtml(base + parentSubPath)}">.. (parent directory)</a></li>`;
      })();

  const dirItems = listing.directories
    .slice()
    .sort()
    .map(
      (dir) =>
        `<li><span class="icon">📁</span><a href="${escapeHtml(currentPath + dir)}">${escapeHtml(dir)}</a></li>`,
    )
    .join("");

  const fileItems = listing.files
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(
      (file) =>
        `<li><span class="icon">${fileIcon(file.name)}</span><a href="${escapeHtml(currentPath + file.name)}">${escapeHtml(file.name)}</a><span class="size">${formatSize(file.size)}</span></li>`,
    )
    .join("");

  const title = isRoot ? id : `${id} / ${subPath}`;
  const folderCount = listing.directories.length;
  const fileCountLabel = `${listing.files.length} file${listing.files.length === 1 ? "" : "s"}`;
  const folderCountLabel = folderCount ? `, ${folderCount} folder${folderCount === 1 ? "" : "s"}` : "";

  const body = `
<h1>${escapeHtml(title)}</h1>
<p class="meta">${fileCountLabel}${folderCountLabel}</p>
<ul class="listing">${parentLink}${dirItems}${fileItems}</ul>
${isRoot ? `<div class="actions"><button class="btn danger" data-delete-artifact="${escapeHtml(id)}">Delete artifact</button></div>` : ""}
${DELETE_SCRIPT}`;

  return pageShell(title, body);
}

function renderSingleFilePage(id: string, file: ArtifactChild): string {
  const fileUrl = `/a/${id}/${file.name}`;
  const body = `
<h1>${escapeHtml(file.name)}</h1>
<p class="meta">${formatSize(file.size)} · uploaded ${escapeHtml(file.uploaded.toISOString())}</p>
<div class="actions">
  <a class="btn" href="${escapeHtml(fileUrl)}">Open file</a>
  <button class="btn danger" data-delete-artifact="${escapeHtml(id)}">Delete artifact</button>
</div>
${DELETE_SCRIPT}`;
  return pageShell(file.name, body);
}
