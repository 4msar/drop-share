import {
    getContentType,
    isInlineSafe,
    isScriptCapableDocument,
} from "../lib/contentType.js";
import { escapeHtml, jsonError, jsonOk } from "../lib/http.js";
import { isValidArtifactId } from "../lib/ids.js";
import { normalizeRelativePath } from "../lib/paths.js";
import {
    type ArtifactChild,
    type ArtifactListing,
    deleteArtifact,
    listArtifactChildren,
} from "../lib/r2.js";

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

export async function handleArtifactJson(
    id: string,
    env: Env,
): Promise<Response> {
    if (!isValidArtifactId(id)) return jsonError(404, "Artifact not found");
    const listing = await listArtifactChildren(env.ARTIFACTS_BUCKET, `${id}/`);
    if (listing.files.length === 0 && listing.directories.length === 0) {
        return jsonError(404, "Artifact not found");
    }
    return jsonOk({
        id,
        url: `/a/${id}/`,
        files: listing.files.map((file) => ({
            name: file.name,
            size: file.size,
            contentType: file.contentType,
        })),
        directories: listing.directories,
    });
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

async function renderDirectory(
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

    const prefix = `${id}/${relSubPath}`;
    const listing = await listArtifactChildren(env.ARTIFACTS_BUCKET, prefix);

    if (listing.files.length === 0 && listing.directories.length === 0) {
        return jsonError(404, "Artifact not found");
    }

    const html = renderArtifactViewerPage(id, relSubPath, listing);
    return htmlResponse(html, request.method);
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

    const contentType =
        object.httpMetadata?.contentType ?? getContentType(normalizedPath);
    const filename = normalizedPath.split("/").pop() ?? normalizedPath;
    const dispositionType = isInlineSafe(contentType) ? "inline" : "attachment";

    const headers = new Headers({
        "Content-Type": contentType,
        "Content-Length": String(object.size),
        "Content-Disposition": contentDispositionHeader(
            dispositionType,
            filename,
        ),
        "Cache-Control": IMMUTABLE_CACHE_CONTROL,
        "X-Content-Type-Options": "nosniff",
        ETag: object.httpEtag,
    });

    if (isScriptCapableDocument(contentType)) {
        // HTML/SVG render inline (so uploaded sites/pages actually work), but any
        // embedded script only ever runs inside a sandboxed, opaque origin - no
        // access to this site's origin, same as if it were on a totally
        // different domain. Omitting allow-same-origin is what makes that hold.
        headers.set(
            "Content-Security-Policy",
            "sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals",
        );
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
    if (["png", "jpg", "jpeg", "gif", "webp", "svg", "ico"].includes(extension))
        return "🖼️";
    if (["zip", "gz", "tar"].includes(extension)) return "🗜️";
    if (extension === "pdf") return "📕";
    return "📄";
}

const SHARE_SCRIPT = `
<script>
  document.querySelectorAll('[data-share]').forEach((btn) => {
    const originalLabel = btn.textContent;
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(window.location.href);
        btn.textContent = 'Copied!';
      } catch (err) {
        btn.textContent = 'Copy failed';
      }
      setTimeout(() => { btn.textContent = originalLabel; }, 1500);
    });
  });
</script>`;

const DELETE_SCRIPT = `
<script>
  document.querySelectorAll('[data-delete-artifact]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this artifact permanently? This cannot be undone.')) return;
      const id = btn.getAttribute('data-delete-artifact');
      const res = await fetch('/api/artifact/' + id, { method: 'DELETE' });
      if (res.ok) {
        document.body.innerHTML = '<main role="status" style="min-height:100vh;display:grid;place-items:center;padding:24px;box-sizing:border-box;font-family:system-ui,-apple-system,sans-serif;background:#fff;color:#374151">' +
          '<section style="width:min(100%,420px);padding:32px;text-align:center;border:1px solid #e5e7eb;border-radius:20px;box-shadow:0 12px 32px rgba(17,24,39,.08)">' +
          '<div style="width:52px;height:52px;margin:0 auto 18px;display:grid;place-items:center;border-radius:50%;font-size:26px;background:#dcfce7;color:#15803d">✓</div>' +
          '<h1 style="margin:0 0 8px;font-size:22px;color:#111827">Artifact deleted</h1>' +
          '<p style="margin:0;color:#6b7280;line-height:1.5">The artifact was permanently deleted. You’ll be redirected home shortly.</p>' +
          '<div style="height:4px;margin-top:24px;overflow:hidden;border-radius:999px;background:#ede9fe"><div style="height:100%;background:#7c3aed;animation:shrink 3s linear forwards"></div></div>' +
          '<style>@keyframes shrink{from{width:100%}to{width:0}}</style></section></main>';
        setTimeout(() => { window.location.href = '/'; }, 3000);
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
  :root {
    --bg: #fff; --text: #374151; --text-h: #111827; --border: #e5e7eb; --muted: #6b7280;
    --accent: #7c3aed; --accent-bg: rgba(124, 58, 237, 0.12);
    color-scheme: light dark;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #16171d; --text: #cbd5e1; --text-h: #f3f4f6; --border: #30323c; --muted: #9ca3af;
      --accent: #c084fc; --accent-bg: rgba(192, 132, 252, 0.15);
    }
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; }
  body { font: 15px/1.5 system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--text); display: flex; flex-direction: column; height: 100vh; }
  a { color: inherit; }
  .viewer-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 18px 24px; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
  .header-actions { display: flex; gap: 8px; flex-shrink: 0; }
  h1 { font-size: 18px; margin: 0 0 2px; word-break: break-all; color: var(--text-h); }
  .meta { color: var(--muted); font-size: 13px; margin: 0; }
  .viewer { flex: 1; display: grid; grid-template-columns: 280px 1fr; min-height: 0; }
  .file-list { overflow-y: auto; border-right: 1px solid var(--border); }
  .file-list ul { list-style: none; margin: 0; padding: 8px; gap: 4px; display: flex; flex-direction: column; }
  .file-item { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 6px; }
  .file-item a { flex: 1; text-decoration: none; word-break: break-all; font-size: 14px; }
  .file-item .size { color: var(--muted); font-size: 12px; white-space: nowrap; }
  .file-item.previewable { cursor: pointer; }
  .file-item .open-tab { flex: 0 0 auto; text-decoration: none; color: var(--muted); opacity: 0.5; padding: 2px 4px; border-radius: 4px; font-size: 14px; width: 24px; height: 24px; display: grid; place-items: center; }
  .open-tab:hover, .open-tab:focus-visible { opacity: 1; color: var(--accent); background: var(--accent-bg); outline: none; }
  .file-item:hover { background: var(--accent-bg); }
  .file-item.active { background: var(--accent-bg); }
  .file-item.active > a { color: var(--accent); font-weight: 500; }
  .icon { width: 1.25em; text-align: center; flex-shrink: 0; }
  .preview-pane { position: relative; display: flex; background: var(--bg); }
  .preview-pane iframe { width: 100%; height: 100%; border: none; flex: 1; background: #fff; }
  .preview-placeholder { margin: auto; color: var(--muted); text-align: center; padding: 24px; max-width: 320px; }
  .btn { display: inline-block; padding: 8px 16px; border-radius: 6px; border: 1px solid var(--border); text-decoration: none; cursor: pointer; background: none; font-size: 13px; font-family: inherit; white-space: nowrap; color: var(--text-h); }
  .btn.danger { border-color: #ef4444; color: #ef4444; }
  @media (max-width: 720px) {
    .viewer { grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
    .file-list { border-right: none; border-bottom: 1px solid var(--border); max-height: 25vh; overflow: auto; }
  }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

/** A small "open in its own tab" link alongside a sidebar item, independent of the inline-preview click handling. */
function openInTabLink(href: string, name: string): string {
    return `<a class="open-tab" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${escapeHtml(name)} in a new tab" title="Open in new tab">↗</a>`;
}

/** Picks which file (if any) the preview pane should show by default: index.html first, else the first previewable file. */
function pickDefaultPreview(
    sortedFiles: ArtifactChild[],
): ArtifactChild | null {
    const previewable = sortedFiles.filter((file) =>
        isInlineSafe(file.contentType ?? getContentType(file.name)),
    );
    if (previewable.length === 0) return null;
    return (
        previewable.find((file) => file.name.toLowerCase() === "index.html") ??
        previewable[0]
    );
}

const PREVIEW_SCRIPT = `
<script>
  document.querySelectorAll('[data-preview]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      document.querySelectorAll('.file-item.active').forEach((item) => item.classList.remove('active'));
      const item = link.closest('.file-item');
      if (item) item.classList.add('active');
      const frame = document.getElementById('preview-frame');
      const placeholder = document.getElementById('preview-placeholder');
      frame.src = link.getAttribute('data-preview');
      frame.hidden = false;
      if (placeholder) placeholder.hidden = true;
    });
  });
</script>`;

function renderArtifactViewerPage(
    id: string,
    subPath: string,
    listing: ArtifactListing,
): string {
    const base = `/a/${id}/`;
    const currentPath = `${base}${subPath}`;
    const isRoot = subPath === "";

    const parentLink = isRoot
        ? ""
        : (() => {
              const trimmed = subPath.replace(/\/$/, "");
              const parentSubPath = trimmed.includes("/")
                  ? `${trimmed.slice(0, trimmed.lastIndexOf("/"))}/`
                  : "";
              return `<li class="file-item"><span class="icon">⬆️</span><a href="${escapeHtml(base + parentSubPath)}">.. (parent directory)</a></li>`;
          })();

    const sortedFiles = listing.files
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name));
    const defaultPreview = pickDefaultPreview(sortedFiles);

    const dirItems = listing.directories
        .slice()
        .sort()
        .map((dir) => {
            const href = currentPath + dir;
            return `<li class="file-item"><span class="icon">📁</span><a href="${escapeHtml(href)}">${escapeHtml(dir)}</a>${openInTabLink(href, dir)}</li>`;
        })
        .join("");

    const fileItems = sortedFiles
        .map((file) => {
            const contentType = file.contentType ?? getContentType(file.name);
            const previewable = isInlineSafe(contentType);
            const href = currentPath + file.name;
            const isActive =
                defaultPreview !== null && file.name === defaultPreview.name;
            const previewAttr = previewable
                ? ` data-preview="${escapeHtml(href)}"`
                : "";
            const classes = [
                "file-item",
                previewable ? "previewable" : "",
                isActive ? "active" : "",
            ]
                .filter(Boolean)
                .join(" ");
            return `<li class="${classes}"><span class="icon">${fileIcon(file.name)}</span><a href="${escapeHtml(href)}"${previewAttr}>${escapeHtml(file.name)}</a><span class="size">${formatSize(file.size)}</span>${openInTabLink(href, file.name)}</li>`;
        })
        .join("");

    const title = isRoot ? id : `${id} / ${subPath}`;
    const folderCount = listing.directories.length;
    const fileCountLabel = `${listing.files.length} file${listing.files.length === 1 ? "" : "s"}`;
    const folderCountLabel = folderCount
        ? `, ${folderCount} folder${folderCount === 1 ? "" : "s"}`
        : "";

    const previewSrc = defaultPreview ? currentPath + defaultPreview.name : "";
    const placeholderText =
        listing.files.length === 0
            ? "This folder only contains subfolders — open one from the list."
            : "No preview available for these files — click one in the list to download it.";

    const body = `
<header class="viewer-header">
  <div>
    <h1>${escapeHtml(title)}</h1>
    <p class="meta">${fileCountLabel}${folderCountLabel}</p>
  </div>
  <div class="header-actions">
    <button class="btn" data-share>Share</button>
    ${isRoot ? `<button class="btn danger" data-delete-artifact="${escapeHtml(id)}">Delete artifact</button>` : ""}
  </div>
</header>
<div class="viewer">
  <nav class="file-list" aria-label="Files in this artifact">
    <ul>${parentLink}${dirItems}${fileItems}</ul>
  </nav>
  <section class="preview-pane">
    <iframe id="preview-frame" title="File preview" src="${escapeHtml(previewSrc)}"${defaultPreview ? "" : " hidden"}></iframe>
    <div id="preview-placeholder" class="preview-placeholder"${defaultPreview ? " hidden" : ""}>
      <p>${escapeHtml(placeholderText)}</p>
    </div>
  </section>
</div>
${PREVIEW_SCRIPT}
${SHARE_SCRIPT}
${DELETE_SCRIPT}`;

    return pageShell(title, body);
}
