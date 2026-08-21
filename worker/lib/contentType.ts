const EXTENSION_MIME: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  xml: "application/xml; charset=utf-8",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  ico: "image/x-icon",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  zip: "application/zip",
  gz: "application/gzip",
  tar: "application/x-tar",
  wasm: "application/wasm",
  woff: "font/woff",
  woff2: "font/woff2",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  webm: "video/webm",
};

/** Best-effort Content-Type for a filename based on its extension, never trusting client-supplied metadata. */
export function getContentType(filename: string): string {
  const dotIndex = filename.lastIndexOf(".");
  if (dotIndex === -1 || dotIndex === filename.length - 1) {
    return "application/octet-stream";
  }
  const extension = filename.slice(dotIndex + 1).toLowerCase();
  return EXTENSION_MIME[extension] ?? "application/octet-stream";
}

const INLINE_SAFE_TYPES = new Set([
  "text/plain; charset=utf-8",
  "text/css; charset=utf-8",
  "text/markdown; charset=utf-8",
  "text/csv; charset=utf-8",
  "application/json; charset=utf-8",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/x-icon",
  "application/pdf",
]);

/**
 * Whether a type is inert enough to render inline in the browser. HTML, JS,
 * and SVG are deliberately excluded even though browsers "understand" them:
 * this app has no separate origin for untrusted content, so anything capable
 * of carrying executable script must always be force-downloaded instead of
 * rendered, to keep uploaded content from running with this origin's
 * privileges. See README security model.
 */
export function isInlineSafe(contentType: string): boolean {
  return INLINE_SAFE_TYPES.has(contentType);
}
