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
  "text/javascript; charset=utf-8",
  "text/html; charset=utf-8",
  "application/json; charset=utf-8",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/x-icon",
  "image/svg+xml",
  "application/pdf",
  "audio/mpeg",
  "video/mp4",
  "video/webm",
]);

// A document navigated to directly only ever executes embedded script if the
// browser parses it as HTML or SVG - a .js/.css file opened directly is just
// displayed as text, and <script src>/<img>/<link> subresource loads ignore
// Content-Disposition entirely. So these two types are the only ones that
// need the sandboxing CSP applied alongside inline rendering.
const SCRIPT_CAPABLE_DOCUMENT_TYPES = new Set(["text/html; charset=utf-8", "image/svg+xml"]);

/** Whether a type is safe enough to render/preview inline rather than force-download. */
export function isInlineSafe(contentType: string): boolean {
  return INLINE_SAFE_TYPES.has(contentType);
}

/** Whether a type can carry executable script when opened directly, and so needs the sandbox CSP. */
export function isScriptCapableDocument(contentType: string): boolean {
  return SCRIPT_CAPABLE_DOCUMENT_TYPES.has(contentType);
}
