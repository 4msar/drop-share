import { describe, expect, it, vi } from "vitest";
import { withNotFoundPage } from "./browse.js";

const SHELL = "<!doctype html><div id=root></div>";

/** env.ASSETS is unavailable under vitest (see routing.test.ts), so it's stubbed here. */
function stubEnv() {
  const fetch = vi.fn(async () => new Response(SHELL, { headers: { "Content-Type": "text/html" } }));
  return { env: { ASSETS: { fetch } } as unknown as Env, fetch };
}

const notFound = () => Response.json({ success: false, error: "Artifact not found" }, { status: 404 });

function request(dest?: string, method = "GET") {
  return new Request("https://example.com/a/01ARZ3NDEKTSV4RRFFQ69G5FAV/", {
    method,
    headers: dest ? { "Sec-Fetch-Dest": dest } : {},
  });
}

describe("withNotFoundPage", () => {
  it("serves the SPA shell with a 404 status for a document navigation", async () => {
    const { env, fetch } = stubEnv();
    const response = await withNotFoundPage(notFound(), request("document"), env);
    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toBe("text/html");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).toBe(SHELL);
    expect(new URL((fetch.mock.calls[0] as unknown as [Request])[0].url).pathname).toBe("/");
  });

  it.each([undefined, "iframe", "style", "image", "empty"])(
    "keeps the JSON 404 for Sec-Fetch-Dest %s",
    async (dest) => {
      const { env, fetch } = stubEnv();
      const response = await withNotFoundPage(notFound(), request(dest), env);
      expect(await response.json()).toEqual({ success: false, error: "Artifact not found" });
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("passes through non-404 responses untouched", async () => {
    const { env, fetch } = stubEnv();
    const ok = new Response("bytes");
    expect(await withNotFoundPage(ok, request("document"), env)).toBe(ok);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("falls back to the JSON 404 if the shell can't be loaded", async () => {
    const env = { ASSETS: { fetch: async () => new Response("", { status: 500 }) } } as unknown as Env;
    const response = await withNotFoundPage(notFound(), request("document"), env);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ success: false, error: "Artifact not found" });
  });
});
