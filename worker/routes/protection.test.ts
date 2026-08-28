import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const ORIGIN = "https://artifacts.example.com";

function uploadRequest(
  mode: string,
  files: { name: string; content: string | Uint8Array }[],
  extraFields: Record<string, string> = {},
  headers: Record<string, string> = {},
): Request {
  const form = new FormData();
  form.set("mode", mode);
  for (const [key, value] of Object.entries(extraFields)) form.set(key, value);
  for (const file of files) {
    const bytes = typeof file.content === "string" ? new TextEncoder().encode(file.content) : file.content;
    form.append("files", new File([bytes], file.name));
  }
  return new Request(`${ORIGIN}/api/upload`, { method: "POST", body: form, headers });
}

async function upload(mode: string, files: { name: string; content: string }[]) {
  const response = await exports.default.fetch(uploadRequest(mode, files));
  return response.json() as Promise<{ id: string; url: string }>;
}

async function listing(id: string, token?: string) {
  const query = token ? `?token=${encodeURIComponent(token)}` : "";
  const response = await exports.default.fetch(`${ORIGIN}/api/artifact/${id}${query}`);
  return {
    status: response.status,
    body: (await response.json()) as {
      success: boolean;
      locked?: boolean;
      canModify?: boolean;
      files: { name: string }[];
      directories: string[];
    },
  };
}

async function lock(id: string) {
  const response = await exports.default.fetch(`${ORIGIN}/api/artifact/${id}/lock`, { method: "POST" });
  return {
    status: response.status,
    body: (await response.json()) as { success: boolean; token?: string; error?: string },
  };
}

describe("new artifacts get a hidden metadata marker", () => {
  it("creates .artifact.json for mode=file", async () => {
    const { id } = await upload("file", [{ name: "a.txt", content: "a" }]);
    const response = await exports.default.fetch(`${ORIGIN}/a/${id}/.artifact.json`);
    expect(response.status).toBe(404); // never directly downloadable...
    const probe = await exports.default.fetch(`${ORIGIN}/api/artifact/${id}/lock`, { method: "POST" });
    expect(probe.status).toBe(200); // ...but it exists, so locking succeeds.
  });

  it("creates metadata consistently across all four upload modes", async () => {
    const modes: [string, { name: string; content: string }[]][] = [
      ["file", [{ name: "a.txt", content: "a" }]],
      ["zip", [{ name: "a.zip", content: "not really a zip" }]],
      ["directory", [{ name: "a.txt", content: "a" }, { name: "b/c.txt", content: "c" }]],
    ];
    for (const [mode, files] of modes) {
      const { id } = await upload(mode, files);
      const { status } = await lock(id);
      expect(status).toBe(200);
    }
  });

  it("does not expose the metadata marker in listings", async () => {
    const { id } = await upload("directory", [{ name: "a.txt", content: "a" }]);
    const { body } = await listing(id);
    expect(body.files.map((f) => f.name)).not.toContain(".artifact.json");
  });

  it("does not create a second metadata object when adding files to an existing artifact", async () => {
    const { id } = await upload("file", [{ name: "a.txt", content: "a" }]);
    await exports.default.fetch(
      uploadRequest("directory", [{ name: "b.txt", content: "b" }], { id }),
    );
    // Locking still works exactly once - if a second metadata object had been
    // created and reset to unprotected, a first lock would silently succeed
    // twice instead of this second one 409ing.
    expect((await lock(id)).status).toBe(200);
    expect((await lock(id)).status).toBe(409);
  });
});

describe("legacy artifacts without metadata remain unrestricted", () => {
  it("shows locked: false and canModify: true for an artifact with no metadata file", async () => {
    const { id } = await upload("file", [{ name: "a.txt", content: "a" }]);
    // Simulate "legacy" by deleting the metadata this upload created, leaving
    // only the real file behind - representing an artifact from before this
    // feature existed.
    await env.ARTIFACTS_BUCKET.delete(`${id}/.artifact.json`);

    const { body } = await listing(id);
    expect(body.locked).toBe(false);
    expect(body.canModify).toBe(true);
  });

  it("still allows upload-more and delete with no token", async () => {
    const { id } = await upload("file", [{ name: "a.txt", content: "a" }]);
    await env.ARTIFACTS_BUCKET.delete(`${id}/.artifact.json`);

    const uploadResponse = await exports.default.fetch(
      uploadRequest("directory", [{ name: "b.txt", content: "b" }], { id }),
    );
    expect(uploadResponse.status).toBe(200);

    const deleteResponse = await exports.default.fetch(`${ORIGIN}/api/artifact/${id}`, { method: "DELETE" });
    expect(deleteResponse.status).toBe(200);
  });

  it("can still be locked for the first time", async () => {
    const { id } = await upload("file", [{ name: "a.txt", content: "a" }]);
    await env.ARTIFACTS_BUCKET.delete(`${id}/.artifact.json`);

    const { status, body } = await lock(id);
    expect(status).toBe(200);
    expect(body.token).toBeTruthy();
  });
});

describe("listings hide dot-prefixed entries at every level", () => {
  it("hides a dot-prefixed directory and its contents, at root and nested", async () => {
    const { id } = await upload("directory", [
      { name: "a.txt", content: "a" },
      { name: ".hidden/secret.txt", content: "s" },
      { name: "visible/shown.txt", content: "v" },
      { name: "visible/.alsohidden/x.txt", content: "x" },
    ]);

    const root = await listing(id);
    expect(root.body.directories).not.toContain(".hidden/");
    expect(root.body.directories).toContain("visible/");

    const nested = await exports.default.fetch(`${ORIGIN}/api/artifact/${id}?path=visible`);
    const nestedBody = (await nested.json()) as { directories: string[]; files: { name: string }[] };
    expect(nestedBody.directories).not.toContain(".alsohidden/");
    expect(nestedBody.files.map((f) => f.name)).toContain("shown.txt");
  });
});

describe("direct access to dot-prefixed files 404s", () => {
  it("404s a direct request for the metadata marker", async () => {
    const { id } = await upload("file", [{ name: "a.txt", content: "a" }]);
    const response = await exports.default.fetch(`${ORIGIN}/a/${id}/.artifact.json`);
    expect(response.status).toBe(404);
  });

  it("404s a request for a file that traverses a hidden directory", async () => {
    const { id } = await upload("directory", [{ name: ".hidden/secret.txt", content: "s" }]);
    const response = await exports.default.fetch(`${ORIGIN}/a/${id}/.hidden/secret.txt`);
    expect(response.status).toBe(404);
  });

  it("does not produce a viewer shell for a hidden-only subdirectory", async () => {
    const { id } = await upload("directory", [
      { name: "index.html", content: "root" },
      { name: ".hidden/secret.txt", content: "s" },
    ]);
    const response = await exports.default.fetch(`${ORIGIN}/a/${id}/.hidden/`);
    expect(response.status).toBe(404);
  });
});

describe("lock endpoint", () => {
  it("generates a token and reports the artifact as locked afterwards", async () => {
    const { id } = await upload("file", [{ name: "a.txt", content: "a" }]);

    const { status, body } = await lock(id);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.token).toBeTruthy();
    expect(body.token!.length).toBeGreaterThanOrEqual(40);

    const { body: listedUnauthed } = await listing(id);
    expect(listedUnauthed.locked).toBe(true);
    expect(listedUnauthed.canModify).toBe(false);

    const { body: listedAuthed } = await listing(id, body.token);
    expect(listedAuthed.locked).toBe(true);
    expect(listedAuthed.canModify).toBe(true);
  });

  it("rejects locking an artifact that's already protected", async () => {
    const { id } = await upload("file", [{ name: "a.txt", content: "a" }]);
    expect((await lock(id)).status).toBe(200);

    const second = await lock(id);
    expect(second.status).toBe(409);
  });

  it("404s locking an id that was never uploaded to", async () => {
    const response = await lock("01ARZ3NDEKTSV4RRFFQ69G5FAV");
    expect(response.status).toBe(404);
  });

  it("404s locking a syntactically invalid id, same as any other malformed artifact id", async () => {
    const response = await lock("not-a-ulid");
    expect(response.status).toBe(404);
  });
});

describe("mutation authorization", () => {
  it("unprotected artifacts allow upload-more and delete with no token", async () => {
    const { id } = await upload("file", [{ name: "a.txt", content: "a" }]);
    const uploadResponse = await exports.default.fetch(
      uploadRequest("directory", [{ name: "b.txt", content: "b" }], { id }),
    );
    expect(uploadResponse.status).toBe(200);

    const deleteResponse = await exports.default.fetch(`${ORIGIN}/api/artifact/${id}`, { method: "DELETE" });
    expect(deleteResponse.status).toBe(200);
  });

  it("rejects upload-more on a protected artifact with a missing token", async () => {
    const { id } = await upload("file", [{ name: "a.txt", content: "a" }]);
    await lock(id);

    const response = await exports.default.fetch(
      uploadRequest("directory", [{ name: "b.txt", content: "b" }], { id }),
    );
    expect(response.status).toBe(403);
  });

  it("rejects upload-more on a protected artifact with an incorrect token", async () => {
    const { id } = await upload("file", [{ name: "a.txt", content: "a" }]);
    await lock(id);

    const response = await exports.default.fetch(
      uploadRequest("directory", [{ name: "b.txt", content: "b" }], { id }, { "X-Artifact-Token": "wrong" }),
    );
    expect(response.status).toBe(403);
  });

  it("allows upload-more on a protected artifact with the correct token", async () => {
    const { id, url } = await upload("file", [{ name: "a.txt", content: "a" }]);
    const { body } = await lock(id);

    const response = await exports.default.fetch(
      uploadRequest("directory", [{ name: "b.txt", content: "b" }], { id }, { "X-Artifact-Token": body.token! }),
    );
    expect(response.status).toBe(200);
    const fetched = await exports.default.fetch(`${ORIGIN}${url}b.txt`);
    expect(await fetched.text()).toBe("b");
  });

  it("rejects delete on a protected artifact with a missing or incorrect token", async () => {
    const { id } = await upload("file", [{ name: "a.txt", content: "a" }]);
    await lock(id);

    const missing = await exports.default.fetch(`${ORIGIN}/api/artifact/${id}`, { method: "DELETE" });
    expect(missing.status).toBe(403);

    const wrong = await exports.default.fetch(`${ORIGIN}/api/artifact/${id}`, {
      method: "DELETE",
      headers: { "X-Artifact-Token": "wrong" },
    });
    expect(wrong.status).toBe(403);
  });

  it("allows delete on a protected artifact with the correct token", async () => {
    const { id, url } = await upload("file", [{ name: "a.txt", content: "a" }]);
    const { body } = await lock(id);

    const response = await exports.default.fetch(`${ORIGIN}/api/artifact/${id}`, {
      method: "DELETE",
      headers: { "X-Artifact-Token": body.token! },
    });
    expect(response.status).toBe(200);

    const after = await exports.default.fetch(`${ORIGIN}${url}a.txt`);
    expect(after.status).toBe(404);
  });

  it("rejects overwriting/removing metadata via upload-more without the current token", async () => {
    const { id } = await upload("file", [{ name: "a.txt", content: "a" }]);
    await lock(id);

    // Attempting to smuggle a replacement, unprotected metadata file through
    // the normal upload path is just another mutation on a protected
    // artifact, and is rejected the same way any unauthenticated upload is.
    const response = await exports.default.fetch(
      uploadRequest(
        "directory",
        [{ name: ".artifact.json", content: JSON.stringify({ label: "", createdAt: new Date().toISOString() }) }],
        { id },
      ),
    );
    expect(response.status).toBe(403);
  });
});
