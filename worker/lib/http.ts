/** Standard error envelope: { success: false, error }. Never include stack traces or internals. */
export function jsonError(status: number, message: string): Response {
  return Response.json({ success: false, error: message }, { status });
}

export function jsonOk(data: Record<string, unknown>, status = 200): Response {
  return Response.json({ success: true, ...data }, { status });
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escapes attacker-controlled text (filenames, paths) before inserting it into server-rendered HTML. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}
