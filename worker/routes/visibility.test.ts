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

    // The share token is not the owner token: every mutation is refused -
    // with the same 404 a missing artifact gets.
    expect((await patch(id, { label: "hijack" }, share)).status).toBe(404);
    expect((await patch(id, { visibility: "public" }, share)).status).toBe(404);
    const del = await get(`/api/artifact/${id}`, {
      method: "DELETE",
      headers: { "X-Artifact-Token": share },
    });
    expect(del.status).toBe(404);
    const up = await exports.default.fetch(
      uploadRequest("directory", [{ name: "x.txt", content: "x" }], { id }, { "X-Artifact-Token": share }),
    );
    expect(up.status).toBe(404);
    expect((await get(`/api/artifact/${id}?token=${OWNER_TOKEN}`)).status).toBe(200);
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

const MISSING_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";

/** Status, body and every header except Date - what an outsider can observe. */
async function observable(response: Response) {
  const headers = [...response.headers].filter(([name]) => name !== "date");
  return { status: response.status, headers, body: await response.text() };
}

describe("a private artifact is indistinguishable from a missing one", () => {
  it.each([
    ["page", (id: string) => `/a/${id}/`],
    ["sub-page", (id: string) => `/a/${id}/sub/`],
    ["raw file", (id: string) => `/a/${id}/index.html`],
    ["folder without slash", (id: string) => `/a/${id}/css`],
    ["share page, no token", (id: string) => `/s/${id}/`],
    ["share file, no token", (id: string) => `/s/${id}/index.html`],
    ["share file, wrong token", (id: string) => `/s/${id}.${"0".repeat(40)}/index.html`],
    ["listing", (id: string) => `/api/artifact/${id}`],
    ["listing, wrong share", (id: string) => `/api/artifact/${id}?share=nope`],
    ["download", (id: string) => `/api/artifact/${id}/download`],
  ])("%s", async (_, path) => {
    const id = await upload([
      { name: "index.html", content: "<h1>x</h1>" },
      { name: "css/a.css", content: "a{}" },
    ]);
    expect((await patch(id, { lock: true, token: OWNER_TOKEN, visibility: "private" })).status).toBe(200);

    const hidden = await observable(await get(path(id), { redirect: "manual" }));
    const missing = await observable(await get(path(MISSING_ID), { redirect: "manual" }));
    expect(hidden.status).toBe(404);
    expect(hidden).toEqual(missing);
  });

  it("answers HEAD the same way", async () => {
    const { id, share } = await privateArtifact();
    expect((await get(`/s/${id}/index.html`, { method: "HEAD" })).status).toBe(404);
    const ok = await get(`/s/${id}.${share}/site/index.html`, { method: "HEAD" });
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("");
  });
});

describe("share route segment parsing", () => {
  it.each([
    ["an empty token after the dot", (id: string) => `/s/${id}./site/index.html`],
    ["extra dots in the token", (id: string, share: string) => `/s/${id}.${share}.x/site/index.html`],
    ["an upper-cased token", (id: string, share: string) => `/s/${id}.${share.toUpperCase()}/site/index.html`],
    ["a truncated token", (id: string, share: string) => `/s/${id}.${share.slice(0, -1)}/site/index.html`],
    ["a percent-encoded dot", (id: string, share: string) => `/s/${id}%2E${share}/site/index.html`],
    ["an invalid id", (_: string, share: string) => `/s/not-an-id.${share}/site/index.html`],
    ["a malformed percent-encoding", (id: string, share: string) => `/s/${id}.${share}/%E0%A4%A`],
    ["a path traversal", (id: string, share: string) => `/s/${id}.${share}/..%2F..%2F${id}%2Fsite%2Findex.html`],
    ["the hidden metadata file", (id: string, share: string) => `/s/${id}.${share}/.artifact.json`],
  ])("404s %s", async (_, path) => {
    const { id, share } = await privateArtifact();
    expect((await get(path(id, share))).status).toBe(404);
  });

  it("serves unicode file names through the share route", async () => {
    const id = await upload([{ name: "café.txt", content: "crème" }]);
    await patch(id, { lock: true, token: OWNER_TOKEN, visibility: "private" });
    const share = await deriveShareToken(OWNER_TOKEN);
    const response = await get(`/s/${id}.${share}/${encodeURIComponent("café.txt")}`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("crème");
  });

  it("serves a legacy artifact with no metadata through /s/", async () => {
    const id = await upload();
    await env.ARTIFACTS_BUCKET.delete(`${id}/.artifact.json`);
    expect((await get(`/s/${id}/site/index.html`)).status).toBe(200);
  });

  it("keeps the share prefix on a folder redirect for a public artifact", async () => {
    const id = await upload();
    const response = await get(`/s/${id}/site`, { redirect: "manual" });
    expect(response.headers.get("Location")).toBe(`${ORIGIN}/s/${id}/site/`);
  });
});

describe("visibility updates: edge cases", () => {
  it("rejects a null visibility", async () => {
    const id = await upload();
    expect((await patch(id, { visibility: null })).status).toBe(400);
  });

  it("applies nothing when one part of a combined update is refused", async () => {
    const id = await upload();
    expect((await patch(id, { label: "renamed", visibility: "private" })).status).toBe(409);
    const listing = (await (await get(`/api/artifact/${id}`)).json()) as { label: string };
    expect(listing.label).not.toBe("renamed");
  });

  it("refuses lock + private on an artifact that is already locked", async () => {
    const { id } = await privateArtifact();
    // Without the owner token it can't even be seen (404); with it, re-locking 409s.
    expect((await patch(id, { lock: true, token: "other-token", visibility: "private" })).status).toBe(404);
    expect(
      (await patch(id, { lock: true, token: "other-token", visibility: "private" }, OWNER_TOKEN)).status,
    ).toBe(409);
    // The original owner token still works - nothing was replaced.
    expect((await patch(id, { visibility: "public" }, OWNER_TOKEN)).status).toBe(200);
  });

  it("lets anyone set an unlocked artifact public (a no-op)", async () => {
    const id = await upload();
    expect((await patch(id, { visibility: "public" })).body.visibility).toBe("public");
  });

  it("404s a visibility change for an artifact that doesn't exist", async () => {
    expect((await patch(MISSING_ID, { visibility: "public" })).status).toBe(404);
  });

  it("keeps label and lock across a visibility round-trip", async () => {
    const { id } = await privateArtifact();
    await patch(id, { label: "Kept" }, OWNER_TOKEN);
    await patch(id, { visibility: "public" }, OWNER_TOKEN);
    const listing = (await (await get(`/api/artifact/${id}?token=${OWNER_TOKEN}`)).json()) as {
      label: string;
      locked: boolean;
      canModify: boolean;
    };
    expect(listing).toMatchObject({ label: "Kept", locked: true, canModify: true });
  });

  it("lets the owner rename and delete files in a private artifact", async () => {
    const { id } = await privateArtifact();
    const rename = await get(`/api/artifact/${id}/file`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "X-Artifact-Token": OWNER_TOKEN },
      body: JSON.stringify({ path: "site/notes.md", newName: "readme.md" }),
    });
    expect(rename.status).toBe(200);
    const del = await get(`/api/artifact/${id}?path=site/readme.md`, {
      method: "DELETE",
      headers: { "X-Artifact-Token": OWNER_TOKEN },
    });
    expect(del.status).toBe(200);
  });
});

describe("document-navigation 404s", () => {
  it("still answers 404 (falling back to JSON when no client assets are built)", async () => {
    const { id } = await privateArtifact();
    const response = await get(`/a/${id}/`, { headers: { "Sec-Fetch-Dest": "document" } });
    expect(response.status).toBe(404);
  });
});

describe("mutations on a private artifact are indistinguishable from a missing one", () => {
  async function upPrivate() {
    const id = await upload([{ name: "a.txt", content: "a" }]);
    await patch(id, { lock: true, token: OWNER_TOKEN, visibility: "private" });
    return id;
  }

  const json = (body: unknown) => ({
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  it.each([
    ["PATCH label", (id: string) => get(`/api/artifact/${id}`, json({ label: "x" }))],
    ["PATCH private", (id: string) => get(`/api/artifact/${id}`, json({ visibility: "private" }))],
    ["PATCH lock", (id: string) => get(`/api/artifact/${id}`, json({ lock: true, token: "t" }))],
    ["DELETE artifact", (id: string) => get(`/api/artifact/${id}`, { method: "DELETE" })],
    ["DELETE file", (id: string) => get(`/api/artifact/${id}?path=a.txt`, { method: "DELETE" })],
    ["rename file", (id: string) => get(`/api/artifact/${id}/file`, json({ path: "a.txt", newName: "b.txt" }))],
    ["no-op rename", (id: string) => get(`/api/artifact/${id}/file`, json({ path: "a.txt", newName: "a.txt" }))],
    ["rename, bad input", (id: string) => get(`/api/artifact/${id}/file`, json({ path: "a.txt" }))],
    ["upload into", (id: string) =>
      exports.default.fetch(uploadRequest("directory", [{ name: "x.txt", content: "x" }], { id }))],
    ["upload into, oversized count", (id: string) =>
      exports.default.fetch(uploadRequest("file", [{ name: "x.txt", content: "x" }, { name: "y.txt", content: "y" }], { id }))],
  ])("%s", async (_, send) => {
    const id = await upPrivate();
    // Error messages may echo the caller's own id back - not a leak.
    const hidden = await observable(await send(id));
    const missing = await observable(await send(MISSING_ID));
    hidden.body = hidden.body.replaceAll(id, "<id>");
    missing.body = missing.body.replaceAll(MISSING_ID, "<id>");
    expect(hidden).toEqual(missing);
    expect(hidden.status).not.toBe(200);
    // And nothing changed.
    expect((await get(`/api/artifact/${id}?token=${OWNER_TOKEN}`)).status).toBe(200);
  });
});

describe("uploads can never write the hidden metadata marker", () => {
  const forged = JSON.stringify({ label: "x", createdAt: "x", visibility: "public" });

  it("skips .artifact.json in a directory upload into a private artifact", async () => {
    const { id } = await privateArtifact();
    const response = await exports.default.fetch(
      uploadRequest(
        "directory",
        [{ name: ".artifact.json", content: forged }, { name: "ok.txt", content: "ok" }],
        { id },
        { "X-Artifact-Token": OWNER_TOKEN },
      ),
    );
    expect(response.status).toBe(200);
    // Still private and still locked.
    expect((await get(`/a/${id}/ok.txt`)).status).toBe(404);
    expect((await get(`/a/${id}/ok.txt?token=${OWNER_TOKEN}`)).status).toBe(200);
    expect((await patch(id, { label: "y" })).status).toBe(404);
  });

  it("skips nested and other dot-files, keeping visible ones", async () => {
    const id = await upload([
      { name: "site/.git/config", content: "x" },
      { name: "site/.DS_Store", content: "x" },
      { name: "site/page.html", content: "x" },
    ]);
    const listing = (await (await get(`/api/artifact/${id}?path=site/`)).json()) as {
      files: { name: string }[];
      directories: string[];
    };
    expect(listing.files.map((f) => f.name)).toEqual(["page.html"]);
    expect(listing.directories).toEqual([]);
    expect(await env.ARTIFACTS_BUCKET.head(`${id}/site/.DS_Store`)).toBeNull();
  });

  it("rejects a directory upload made only of dot-files", async () => {
    const response = await exports.default.fetch(
      uploadRequest("directory", [{ name: ".artifact.json", content: forged }]),
    );
    expect(response.status).toBe(400);
  });

  it("rejects a single-file upload of a dot-file", async () => {
    const id = await upload([{ name: "a.txt", content: "a" }]);
    const response = await exports.default.fetch(
      uploadRequest("file", [{ name: ".artifact.json", content: forged }], { id }),
    );
    expect(response.status).toBe(400);
  });
});

describe("metadata parsing fails closed", () => {
  it("treats an explicit null visibility as malformed (unreadable)", async () => {
    const id = await upload();
    await env.ARTIFACTS_BUCKET.put(
      `${id}/.artifact.json`,
      JSON.stringify({ label: "x", createdAt: "x", token: "t", visibility: null }),
    );
    expect((await get(`/a/${id}/site/index.html`)).status).toBe(404);
  });
});

describe("conditional responses on the share route", () => {
  it("keeps the private cache policy on a 304", async () => {
    const { id, share } = await privateArtifact();
    const first = await get(`/s/${id}.${share}/site/index.html`);
    const etag = first.headers.get("ETag")!;
    const second = await get(`/s/${id}.${share}/site/index.html`, { headers: { "If-None-Match": etag } });
    expect(second.status).toBe(304);
    expect(second.headers.get("Cache-Control")).toBe("private, max-age=0, must-revalidate");
  });
});

describe("redirects and segment decoding", () => {
  it("keeps the owner's ?token= across a folder redirect on /a/", async () => {
    const { id } = await privateArtifact();
    const response = await get(`/a/${id}/site?token=${OWNER_TOKEN}`, { redirect: "manual" });
    expect(response.status).toBe(301);
    expect(response.headers.get("Location")).toBe(`${ORIGIN}/a/${id}/site/?token=${OWNER_TOKEN}`);
  });

  it("encodes special characters in a redirected folder name", async () => {
    const id = await upload([{ name: "a#b?c/x.txt", content: "x" }]);
    const response = await get(`/a/${id}/${encodeURIComponent("a#b?c")}`, { redirect: "manual" });
    expect(response.headers.get("Location")).toBe(`${ORIGIN}/a/${id}/a%23b%3Fc/`);
  });

  it("decodes a percent-encoded share token the same way the client does", async () => {
    const { id, share } = await privateArtifact();
    const encoded = `%${share.charCodeAt(0).toString(16)}${share.slice(1)}`;
    expect((await get(`/s/${id}.${encoded}/site/index.html`)).status).toBe(200);
  });

  it("404s a malformed percent-encoding in the token", async () => {
    const { id } = await privateArtifact();
    expect((await get(`/s/${id}.%E0%A4%A/site/index.html`)).status).toBe(404);
  });

  it("treats an empty token after the dot as no token", async () => {
    const id = await upload();
    expect((await get(`/s/${id}./site/index.html`)).status).toBe(200);
    const { id: privateId } = await privateArtifact();
    expect((await get(`/s/${privateId}./site/index.html`)).status).toBe(404);
  });
});
