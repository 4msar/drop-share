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
