import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const ORIGIN = "https://artifacts.example.com";
const VALID_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";

function fetchWith(path: string, init?: RequestInit) {
  return exports.default.fetch(new Request(`${ORIGIN}${path}`, init));
}

// These 405s were previously untested. They are pinned here so the routing
// refactor cannot silently downgrade them to Hono's default 404.
describe("method handling on API routes", () => {
  it("405s a POST to /api/health", async () => {
    const response = await fetchWith("/api/health", { method: "POST" });
    expect(response.status).toBe(405);
    expect(await response.json()).toEqual({ success: false, error: "Method not allowed" });
  });

  it("405s a GET to /api/upload", async () => {
    const response = await fetchWith("/api/upload");
    expect(response.status).toBe(405);
  });

  it("405s a PUT to /api/artifact/:id", async () => {
    const response = await fetchWith(`/api/artifact/${VALID_ID}`, { method: "PUT" });
    expect(response.status).toBe(405);
  });

  it("405s a POST to an artifact browse path", async () => {
    const response = await fetchWith(`/a/${VALID_ID}/`, { method: "POST" });
    expect(response.status).toBe(405);
  });

  it("404s an unknown /api/ path", async () => {
    const response = await fetchWith("/api/nope");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ success: false, error: "Not found" });
  });
});

describe("artifact path parsing", () => {
  it("404s an artifact sub-path with a malformed percent-encoding", async () => {
    const response = await fetchWith(`/a/${VALID_ID}/%E0%A4%A.html`);
    expect(response.status).toBe(404);
  });

  it("treats an artifact id with no trailing slash as a directory request", async () => {
    // /a/<id> (no slash) resolves the same way /a/<id>/ does.
    const response = await fetchWith(`/a/${VALID_ID}`);
    expect(response.status).toBe(404);
  });
});

// Directory URLs hand off to the SPA shell, which needs built client assets
// and so cannot be exercised here (env.ASSETS is unavailable under vitest).
// What is testable - and what actually matters - is that the Worker still
// rejects bad artifact paths *before* reaching that handoff, rather than
// answering 200 for every `/a/<anything>/`.
describe("directory requests are validated before the SPA shell is served", () => {
  it("404s a directory request for an artifact that does not exist", async () => {
    const response = await fetchWith(`/a/${VALID_ID}/`);
    expect(response.status).toBe(404);
  });

  it("404s a directory request for a malformed artifact id", async () => {
    expect((await fetchWith("/a/not-a-ulid/")).status).toBe(404);
  });

  it("404s a directory request whose sub-path escapes the artifact", async () => {
    // %2f is not decoded by the URL parser, so "%2e%2e%2f" stays a single
    // segment rather than being collapsed as a double-dot segment. That is
    // what makes this reach the app's own normalizeRelativePath defense
    // instead of being rewritten away before routing.
    const response = await fetchWith(`/a/${VALID_ID}/%2e%2e%2f/`);
    expect(response.status).toBe(404);
  });
});
