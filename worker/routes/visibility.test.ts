import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { deriveShareToken } from "../lib/artifactMeta.js";

const ORIGIN = "https://artifacts.example.com";
const OWNER_TOKEN = "test-owner-token-0123456789";

function uploadRequest(
  mode: string,
  files: { name: string; content: string }[],
  extraFields: Record<string, string> = {},
  headers: Record<string, string> = {},
): Request {
  const form = new FormData();
  form.set("mode", mode);
  for (const [key, value] of Object.entries(extraFields)) form.set(key, value);
  for (const file of files) form.append("files", new File([file.content], file.name));
  return new Request(`${ORIGIN}/api/upload`, { method: "POST", body: form, headers });
}

const SITE = [
  { name: "site/index.html", content: '<link rel="stylesheet" href="css/style.css"><h1>hi</h1>' },
  { name: "site/css/style.css", content: "h1 { color: red }" },
  { name: "site/notes.md", content: "# Notes" },
];

async function upload(files = SITE): Promise<string> {
  const response = await exports.default.fetch(uploadRequest("directory", files));
  return ((await response.json()) as { id: string }).id;
}

async function patch(id: string, body: Record<string, unknown>, token?: string) {
  const response = await exports.default.fetch(`${ORIGIN}/api/artifact/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "X-Artifact-Token": token } : {}),
    },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    body: (await response.json()) as { visibility?: string; locked?: boolean; error?: string },
  };
}

/** Uploads the sample site, locks it and makes it private in one PATCH. */
async function privateArtifact(): Promise<{ id: string; share: string }> {
  const id = await upload();
  const { status } = await patch(id, { lock: true, token: OWNER_TOKEN, visibility: "private" });
  expect(status).toBe(200);
  return { id, share: await deriveShareToken(OWNER_TOKEN) };
}

const get = (path: string, init?: RequestInit) => exports.default.fetch(`${ORIGIN}${path}`, init);

describe("private artifacts are hidden without a valid share token", () => {
  it("404s every read path on /a/ with no token", async () => {
    const { id } = await privateArtifact();
    for (const path of [
      `/a/${id}/`,
      `/a/${id}/site/`,
      `/a/${id}/site/index.html`,
      `/a/${id}/site/notes.md?render=html`,
      `/api/artifact/${id}`,
      `/api/artifact/${id}/download`,
    ]) {
      expect((await get(path)).status, path).toBe(404);
    }
  });

  it("404s the share route with a wrong or missing token", async () => {
    const { id } = await privateArtifact();
    for (const path of [
      `/s/${id}/site/index.html`,
      `/s/${id}.wrong/site/index.html`,
      `/s/${id}.wrong/`,
      `/api/artifact/${id}?share=wrong`,
      `/api/artifact/${id}/download?share=wrong`,
    ]) {
      expect((await get(path)).status, path).toBe(404);
    }
  });

  it("does not accept the owner token in place of the share token on /s/", async () => {
    const { id } = await privateArtifact();
    expect((await get(`/s/${id}.${OWNER_TOKEN}/site/index.html`)).status).toBe(404);
    expect((await get(`/s/${id}/site/index.html?token=${OWNER_TOKEN}`)).status).toBe(404);
  });

  it("looks identical to a missing artifact", async () => {
    const { id } = await privateArtifact();
    const hidden = await get(`/api/artifact/${id}`);
    const missing = await get(`/api/artifact/01ARZ3NDEKTSV4RRFFQ69G5FAV`);
    expect(hidden.status).toBe(missing.status);
    expect(await hidden.json()).toEqual(await missing.json());
  });
});

describe("the share route serves private artifacts read-only", () => {
  it("serves files, relative assets and rendered markdown", async () => {
    const { id, share } = await privateArtifact();
    const base = `/s/${id}.${share}`;

    // (A 200 shell for directory URLs needs built client assets, which
    // aren't available under vitest - see routing.test.ts.)
    const page = await get(`${base}/site/index.html`);
    expect(page.status).toBe(200);
    expect(page.headers.get("Content-Security-Policy")).toContain("sandbox");

    // The relative `css/style.css` resolves under the same /s/ prefix.
    const css = await get(`${base}/site/css/style.css`);
    expect(css.status).toBe(200);
    expect(await css.text()).toBe("h1 { color: red }");

    const md = await get(`${base}/site/notes.md?render=html`);
    expect(md.status).toBe(200);
    expect(await md.text()).toContain("<h1>Notes</h1>");
  });

  it("adds privacy headers to share responses", async () => {
    const { id, share } = await privateArtifact();
    const response = await get(`/s/${id}.${share}/site/index.html`);
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex");
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=0, must-revalidate");
    expect(response.headers.get("ETag")).not.toBeNull();
  });

  it("redirects a folder path without a slash under the same share prefix", async () => {
    const { id, share } = await privateArtifact();
    const response = await get(`/s/${id}.${share}/site`, { redirect: "manual" });
    expect(response.status).toBe(301);
    expect(response.headers.get("Location")).toBe(`${ORIGIN}/s/${id}.${share}/site/`);
  });

  it("lists and downloads with ?share= but never grants modify access", async () => {
    const { id, share } = await privateArtifact();

    const listing = await get(`/api/artifact/${id}?share=${share}`);
    expect(listing.status).toBe(200);
    expect(await listing.json()).toMatchObject({
      locked: true,
      canModify: false,
      visibility: "private",
    });

    expect((await get(`/api/artifact/${id}/download?share=${share}`)).status).toBe(200);

    // The share token is not the owner token: every mutation is refused.
    expect((await patch(id, { label: "hijack" }, share)).status).toBe(403);
    expect((await patch(id, { visibility: "public" }, share)).status).toBe(403);
    const del = await get(`/api/artifact/${id}`, {
      method: "DELETE",
      headers: { "X-Artifact-Token": share },
    });
    expect(del.status).toBe(403);
    const up = await exports.default.fetch(
      uploadRequest("directory", [{ name: "x.txt", content: "x" }], { id }, { "X-Artifact-Token": share }),
    );
    expect(up.status).toBe(403);
  });

  it("lets the owner token read a private artifact on /a/", async () => {
    const { id } = await privateArtifact();
    expect((await get(`/a/${id}/site/index.html?token=${OWNER_TOKEN}`)).status).toBe(200);
    const listing = await get(`/api/artifact/${id}?token=${OWNER_TOKEN}`);
    expect(await listing.json()).toMatchObject({ canModify: true, visibility: "private" });
    const download = await get(`/api/artifact/${id}/download`, {
      headers: { "X-Artifact-Token": OWNER_TOKEN },
    });
    expect(download.status).toBe(200);
  });

  it("405s non-read methods on the share route", async () => {
    const { id, share } = await privateArtifact();
    expect((await get(`/s/${id}.${share}/site/index.html`, { method: "POST" })).status).toBe(405);
    expect((await get(`/s/${id}`, { method: "DELETE" })).status).toBe(405);
  });
});

describe("public artifacts on the share route", () => {
  it("serves without a token, and ignores any token given", async () => {
    const id = await upload();
    expect((await get(`/s/${id}/site/index.html`)).status).toBe(200);
    expect((await get(`/s/${id}.anything/site/index.html`)).status).toBe(200);
    expect((await get(`/a/${id}/site/index.html`)).status).toBe(200);
  });

  it("keeps the public cache policy", async () => {
    const id = await upload();
    const response = await get(`/s/${id}/site/index.html`);
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=0, must-revalidate");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
  });
});

describe("changing visibility", () => {
  it("refuses to make an unlocked artifact private", async () => {
    const id = await upload();
    const { status, body } = await patch(id, { visibility: "private" });
    expect(status).toBe(409);
    expect(body.error).toMatch(/lock/i);
  });

  it("requires the owner token to change visibility of a locked artifact", async () => {
    const id = await upload();
    expect((await patch(id, { lock: true, token: OWNER_TOKEN })).status).toBe(200);
    expect((await patch(id, { visibility: "private" })).status).toBe(403);
    expect((await patch(id, { visibility: "private" }, "wrong")).status).toBe(403);
    expect((await patch(id, { visibility: "private" }, OWNER_TOKEN)).body.visibility).toBe("private");
  });

  it("rejects an unknown visibility value", async () => {
    const id = await upload();
    expect((await patch(id, { visibility: "secret" })).status).toBe(400);
  });

  it("round-trips private -> public -> private", async () => {
    const { id, share } = await privateArtifact();
    expect((await patch(id, { visibility: "public" }, OWNER_TOKEN)).body.visibility).toBe("public");
    expect((await get(`/a/${id}/site/index.html`)).status).toBe(200);

    expect((await patch(id, { visibility: "private" }, OWNER_TOKEN)).body.visibility).toBe("private");
    expect((await get(`/a/${id}/site/index.html`)).status).toBe(404);
    // Same owner token, same share token: the old link works again.
    expect((await get(`/s/${id}.${share}/site/index.html`)).status).toBe(200);
  });

  it("keeps visibility when files are re-uploaded into the artifact", async () => {
    const { id } = await privateArtifact();
    const response = await exports.default.fetch(
      uploadRequest("directory", [{ name: "more.txt", content: "x" }], { id }, { "X-Artifact-Token": OWNER_TOKEN }),
    );
    expect(response.status).toBe(200);
    expect((await get(`/a/${id}/more.txt`)).status).toBe(404);
  });
});

describe("malformed metadata fails closed for reads", () => {
  it("404s reads when .artifact.json can't be parsed", async () => {
    const id = await upload();
    await env.ARTIFACTS_BUCKET.put(`${id}/.artifact.json`, "not json{{{");
    expect((await get(`/a/${id}/site/index.html`)).status).toBe(404);
    expect((await get(`/api/artifact/${id}`)).status).toBe(404);
  });
});
