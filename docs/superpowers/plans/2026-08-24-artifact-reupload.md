# Artifact Re-upload / Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an existing artifact be updated in place (add new files, overwrite existing ones, leave the rest untouched) via the `/api/upload` endpoint, an "Upload" button on the viewer page, and a `drop-share update` CLI command that remembers previously-published artifacts.

**Architecture:** `/api/upload` gains an optional `id` form field; when present, files are written under that existing artifact's prefix instead of a freshly minted one, with existing-artifact totals folded into the size/count limit checks. The viewer page's `.header-actions` gets an Upload button wired to the same endpoint via a small inline script. The CLI gains a global `~/.drop-share/state.json` mapping local paths to artifact ids, three new pure modules (`state.ts`, `args.ts`, `plan.ts`) for testability, and a new `update` command.

**Tech Stack:** Cloudflare Workers (TypeScript), R2, vitest + `@cloudflare/vitest-plugin` for worker tests, a new standalone `vitest` setup for the Node-based CLI package.

**Spec:** `docs/superpowers/specs/2026-08-24-artifact-reupload-design.md`

## Global Constraints

- No new authentication/ownership token — knowing an artifact's ULID is sufficient to update it, same as delete today.
- Merge semantics only: overwrite matching paths, add new paths, never delete files missing from the current batch.
- File byte responses (raw and rendered-markdown) must never claim `immutable` caching again — they must always revalidate, since content can now change.
- `MAX_ARTIFACT_SIZE_BYTES` / `MAX_ARTIFACT_FILE_COUNT` apply to the combined total (pre-existing + this batch) on every update, across all four upload modes.
- CLI state lives in a single global file (`~/.drop-share/state.json`), never a marker file inside the uploaded folder.

---

### Task 1: Server — support updating an existing artifact via `id`

**Files:**
- Modify: `worker/lib/r2.ts` (`listAllArtifactKeys`, `deleteArtifact`)
- Modify: `worker/routes/upload.ts` (whole file)
- Test: `worker/routes/upload.test.ts`

**Interfaces:**
- Produces: `listAllArtifactKeys(bucket: R2Bucket, artifactId: string): Promise<{ key: string; size: number }[]>` (return type changes from `string[]`)
- Produces: `handleUpload(request: Request, env: Env): Promise<Response>` — now accepts an optional `id` form field; `mode` values and success/error response shapes are otherwise unchanged.

- [ ] **Step 1: Write the failing tests**

Append to `worker/routes/upload.test.ts`:

```ts
describe("POST /api/upload: id=<existing> (update)", () => {
  it("overwrites a file at an existing path and adds a new path, leaving other files untouched", async () => {
    const created = await (
      await exports.default.fetch(
        uploadRequest("directory", [
          { name: "a.txt", content: "a-original" },
          { name: "b.txt", content: "b-original" },
        ]),
      )
    ).json();

    const updateResponse = await exports.default.fetch(
      uploadRequest(
        "directory",
        [
          { name: "a.txt", content: "a-updated" },
          { name: "c.txt", content: "c-new" },
        ],
        { id: created.id },
      ),
    );
    expect(updateResponse.status).toBe(200);
    const updated = await updateResponse.json();
    expect(updated.id).toBe(created.id);

    const a = await (await exports.default.fetch(`https://artifacts.example.com${created.url}a.txt`)).text();
    const b = await (await exports.default.fetch(`https://artifacts.example.com${created.url}b.txt`)).text();
    const c = await (await exports.default.fetch(`https://artifacts.example.com${created.url}c.txt`)).text();
    expect(a).toBe("a-updated");
    expect(b).toBe("b-original");
    expect(c).toBe("c-new");
  });

  it("404s when the id doesn't correspond to any existing artifact", async () => {
    const response = await exports.default.fetch(
      uploadRequest("file", [{ name: "a.txt", content: "a" }], { id: "01ARZ3NDEKTSV4RRFFQ69G5FAV" }),
    );
    expect(response.status).toBe(404);
  });

  it("400s on a syntactically invalid id", async () => {
    const response = await exports.default.fetch(
      uploadRequest("file", [{ name: "a.txt", content: "a" }], { id: "not-a-ulid" }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects an update whose existing-plus-new total exceeds the artifact size cap", async () => {
    const chunk = new Uint8Array(6 * 1024 * 1024); // 6MB
    const created = await (
      await exports.default.fetch(uploadRequest("file", [{ name: "big.bin", content: chunk }]))
    ).json();

    // 6MB existing + 6MB new = 12MB > 10MB cap, even though neither file alone exceeds it.
    const response = await exports.default.fetch(
      uploadRequest("file", [{ name: "second.bin", content: chunk }], { id: created.id }),
    );
    expect(response.status).toBe(413);
  });

  it("rejects an update that would exceed the artifact file-count cap", async () => {
    const files = Array.from({ length: 1999 }, (_, i) => ({ name: `f${i}.txt`, content: "" }));
    const created = await (await exports.default.fetch(uploadRequest("directory", files))).json();

    // Adding 2 more brings the total to 2001, over the 2000 file limit,
    // even though this single request only sends 2 files.
    const response = await exports.default.fetch(
      uploadRequest(
        "directory",
        [
          { name: "extra1.txt", content: "" },
          { name: "extra2.txt", content: "" },
        ],
        { id: created.id },
      ),
    );
    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run worker/routes/upload.test.ts`
Expected: the 5 new tests FAIL — the first because `a.txt`/`b.txt` come back unchanged/missing (no `id` support exists), the rest because passing `id` today is silently ignored (no 404/400/413 differentiation occurs).

- [ ] **Step 3: Change `listAllArtifactKeys` to return sizes**

Replace in `worker/lib/r2.ts`:

```ts
/** Lists every object key under an artifact id, regardless of nesting - used for delete and existence checks. */
export async function listAllArtifactKeys(bucket: R2Bucket, artifactId: string): Promise<string[]> {
  const prefix = `${artifactId}/`;
  const keys: string[] = [];
  let cursor: string | undefined;

  do {
    const page = await bucket.list({ prefix, cursor });
    keys.push(...page.objects.map((object) => object.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  return keys;
}

/** Deletes every object belonging to an artifact. The artifact id itself is never reused afterwards. */
export async function deleteArtifact(bucket: R2Bucket, artifactId: string): Promise<number> {
  const keys = await listAllArtifactKeys(bucket, artifactId);
  for (let i = 0; i < keys.length; i += DELETE_BATCH_SIZE) {
    await bucket.delete(keys.slice(i, i + DELETE_BATCH_SIZE));
  }
  return keys.length;
}
```

with:

```ts
export interface ArtifactObjectRef {
  key: string;
  size: number;
}

/** Lists every object (key + size) under an artifact id, regardless of nesting - used for delete, existence checks, and total-size accounting. */
export async function listAllArtifactKeys(bucket: R2Bucket, artifactId: string): Promise<ArtifactObjectRef[]> {
  const prefix = `${artifactId}/`;
  const refs: ArtifactObjectRef[] = [];
  let cursor: string | undefined;

  do {
    const page = await bucket.list({ prefix, cursor });
    refs.push(...page.objects.map((object) => ({ key: object.key, size: object.size })));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  return refs;
}

/** Deletes every object belonging to an artifact. The artifact id itself is never reused afterwards. */
export async function deleteArtifact(bucket: R2Bucket, artifactId: string): Promise<number> {
  const refs = await listAllArtifactKeys(bucket, artifactId);
  const keys = refs.map((ref) => ref.key);
  for (let i = 0; i < keys.length; i += DELETE_BATCH_SIZE) {
    await bucket.delete(keys.slice(i, i + DELETE_BATCH_SIZE));
  }
  return keys.length;
}
```

- [ ] **Step 4: Rewrite `worker/routes/upload.ts` in full**

Replace the entire file with:

```ts
import { getContentType } from "../lib/contentType.js";
import { jsonError, jsonOk } from "../lib/http.js";
import { generateArtifactId, isValidArtifactId } from "../lib/ids.js";
import { buildObjectKey, normalizeRelativePath } from "../lib/paths.js";
import { listAllArtifactKeys } from "../lib/r2.js";
import { PayloadTooLargeError, SizeBudget, checkFileSize } from "../lib/validation.js";
import { ZipValidationError, extractZipSafely } from "../lib/zip.js";

class UploadValidationError extends Error {}
class ArtifactNotFoundError extends Error {}

type UploadMode = "file" | "zip" | "directory" | "zip-extract";

interface Limits {
  maxFileSizeBytes: number;
  maxArtifactSizeBytes: number;
  maxArtifactFileCount: number;
}

// Generous margin over the artifact size cap to account for multipart
// boundaries/headers, so we can reject absurdly large requests before even
// parsing them, without false-rejecting a legitimate near-the-limit upload.
const OVERHEAD_ALLOWANCE_BYTES = 1024 * 1024;

function parseLimits(env: Env): Limits {
  return {
    maxFileSizeBytes: Number(env.MAX_FILE_SIZE_BYTES),
    maxArtifactSizeBytes: Number(env.MAX_ARTIFACT_SIZE_BYTES),
    maxArtifactFileCount: Number(env.MAX_ARTIFACT_FILE_COUNT),
  };
}

export async function handleUpload(request: Request, env: Env): Promise<Response> {
  const limits = parseLimits(env);

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > limits.maxArtifactSizeBytes + OVERHEAD_ALLOWANCE_BYTES) {
    return jsonError(413, `Upload exceeds the ${limits.maxArtifactSizeBytes}-byte maximum artifact size`);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError(400, "Malformed multipart/form-data request");
  }

  const mode = form.get("mode");
  if (mode !== "file" && mode !== "zip" && mode !== "directory" && mode !== "zip-extract") {
    return jsonError(400, 'Invalid or missing "mode" (expected file, zip, directory, or zip-extract)');
  }

  const rawId = form.get("id");
  let existingId: string | undefined;
  if (typeof rawId === "string" && rawId.length > 0) {
    if (!isValidArtifactId(rawId)) {
      return jsonError(400, "Invalid artifact id");
    }
    existingId = rawId;
  }

  const parts = form.getAll("files").filter((value): value is File => value instanceof File);
  if (parts.length === 0) {
    return jsonError(400, "No files provided");
  }

  try {
    const result = await uploadByMode(mode, parts, limits, env, existingId);
    return jsonOk(result);
  } catch (error) {
    if (error instanceof ArtifactNotFoundError) return jsonError(404, error.message);
    if (error instanceof PayloadTooLargeError) return jsonError(413, error.message);
    if (error instanceof ZipValidationError) return jsonError(400, error.message);
    if (error instanceof UploadValidationError) return jsonError(400, error.message);
    console.error("upload failed:", error instanceof Error ? error.message : "unknown error");
    return jsonError(500, "Internal error while processing upload");
  }
}

/**
 * Loads the size/count of an existing artifact's objects, excluding any
 * relative paths this batch is about to overwrite (so combining it with the
 * new batch's totals doesn't double-count overwritten files). Returns null
 * if the artifact doesn't exist at all.
 */
async function loadExistingArtifact(
  bucket: R2Bucket,
  artifactId: string,
  excludePaths: Set<string>,
): Promise<{ totalSize: number; fileCount: number } | null> {
  const refs = await listAllArtifactKeys(bucket, artifactId);
  if (refs.length === 0) return null;

  const prefix = `${artifactId}/`;
  let totalSize = 0;
  let fileCount = 0;
  for (const ref of refs) {
    const relativePath = ref.key.slice(prefix.length);
    if (excludePaths.has(relativePath)) continue;
    totalSize += ref.size;
    fileCount += 1;
  }
  return { totalSize, fileCount };
}

async function uploadByMode(
  mode: UploadMode,
  parts: File[],
  limits: Limits,
  env: Env,
  existingId: string | undefined,
): Promise<{ id: string; url: string }> {
  switch (mode) {
    case "file":
      return uploadSingleFile(env, parts, limits, false, existingId);
    case "zip":
      return uploadSingleFile(env, parts, limits, true, existingId);
    case "directory":
      return uploadDirectory(env, parts, limits, existingId);
    case "zip-extract":
      return uploadZipExtract(env, parts, limits, existingId);
  }
}

async function uploadSingleFile(
  env: Env,
  parts: File[],
  limits: Limits,
  isZip: boolean,
  existingId: string | undefined,
): Promise<{ id: string; url: string }> {
  if (parts.length !== 1) {
    throw new UploadValidationError(`Expected exactly one file for this upload mode, received ${parts.length}`);
  }
  const file = parts[0];
  checkFileSize(file.size, limits.maxFileSizeBytes, file.name);

  const relativePath = normalizeRelativePath(file.name);
  if (relativePath === null) {
    throw new UploadValidationError(`Unsafe or invalid filename: ${file.name}`);
  }

  const id = existingId ?? generateArtifactId();

  if (existingId) {
    const existing = await loadExistingArtifact(env.ARTIFACTS_BUCKET, existingId, new Set([relativePath]));
    if (existing === null) {
      throw new ArtifactNotFoundError(`Artifact not found: ${existingId}`);
    }
    if (existing.fileCount + 1 > limits.maxArtifactFileCount) {
      throw new UploadValidationError(
        `Artifact would contain ${existing.fileCount + 1} files, exceeding the ${limits.maxArtifactFileCount} file limit`,
      );
    }
    const budget = new SizeBudget(limits.maxArtifactSizeBytes);
    budget.add(existing.totalSize);
    budget.add(file.size);
  }

  const key = buildObjectKey(id, relativePath);
  const contentType = isZip ? "application/zip" : getContentType(relativePath);

  await env.ARTIFACTS_BUCKET.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType },
  });

  return { id, url: `/a/${id}/` };
}

async function uploadDirectory(
  env: Env,
  parts: File[],
  limits: Limits,
  existingId: string | undefined,
): Promise<{ id: string; url: string }> {
  if (parts.length > limits.maxArtifactFileCount) {
    throw new UploadValidationError(
      `Upload contains ${parts.length} files, exceeding the ${limits.maxArtifactFileCount} file limit`,
    );
  }

  const planned: { path: string; file: File }[] = [];
  const seenPaths = new Set<string>();

  for (const file of parts) {
    checkFileSize(file.size, limits.maxFileSizeBytes, file.name);

    const relativePath = normalizeRelativePath(file.name);
    if (relativePath === null) {
      throw new UploadValidationError(`Unsafe or invalid path: ${file.name}`);
    }
    if (seenPaths.has(relativePath)) {
      throw new UploadValidationError(`Duplicate path in upload: ${relativePath}`);
    }
    seenPaths.add(relativePath);
    planned.push({ path: relativePath, file });
  }

  const id = existingId ?? generateArtifactId();
  const budget = new SizeBudget(limits.maxArtifactSizeBytes);
  let fileCount = planned.length;

  if (existingId) {
    const existing = await loadExistingArtifact(env.ARTIFACTS_BUCKET, existingId, seenPaths);
    if (existing === null) {
      throw new ArtifactNotFoundError(`Artifact not found: ${existingId}`);
    }
    fileCount += existing.fileCount;
    budget.add(existing.totalSize);
  }

  if (fileCount > limits.maxArtifactFileCount) {
    throw new UploadValidationError(
      `Artifact would contain ${fileCount} files, exceeding the ${limits.maxArtifactFileCount} file limit`,
    );
  }

  for (const { file } of planned) {
    budget.add(file.size);
  }

  for (const { path, file } of planned) {
    const key = buildObjectKey(id, path);
    await env.ARTIFACTS_BUCKET.put(key, await file.arrayBuffer(), {
      httpMetadata: { contentType: getContentType(path) },
    });
  }

  return { id, url: `/a/${id}/` };
}

async function uploadZipExtract(
  env: Env,
  parts: File[],
  limits: Limits,
  existingId: string | undefined,
): Promise<{ id: string; url: string }> {
  if (parts.length !== 1) {
    throw new UploadValidationError(`Expected exactly one ZIP file, received ${parts.length}`);
  }
  const zipFile = parts[0];
  checkFileSize(zipFile.size, limits.maxFileSizeBytes, zipFile.name);

  const zipBytes = new Uint8Array(await zipFile.arrayBuffer());
  const extracted = await extractZipSafely(zipBytes, {
    maxTotalBytes: limits.maxArtifactSizeBytes,
    maxEntryCount: limits.maxArtifactFileCount,
  });

  const id = existingId ?? generateArtifactId();

  if (existingId) {
    const extractedPaths = new Set(extracted.map((entry) => entry.path));
    const existing = await loadExistingArtifact(env.ARTIFACTS_BUCKET, existingId, extractedPaths);
    if (existing === null) {
      throw new ArtifactNotFoundError(`Artifact not found: ${existingId}`);
    }
    const combinedFileCount = existing.fileCount + extracted.length;
    if (combinedFileCount > limits.maxArtifactFileCount) {
      throw new UploadValidationError(
        `Artifact would contain ${combinedFileCount} files, exceeding the ${limits.maxArtifactFileCount} file limit`,
      );
    }
    const budget = new SizeBudget(limits.maxArtifactSizeBytes);
    budget.add(existing.totalSize);
    for (const entry of extracted) {
      budget.add(entry.data.byteLength);
    }
  }

  for (const entry of extracted) {
    const key = buildObjectKey(id, entry.path);
    await env.ARTIFACTS_BUCKET.put(key, entry.data, {
      httpMetadata: { contentType: getContentType(entry.path) },
    });
  }

  return { id, url: `/a/${id}/` };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run worker/routes/upload.test.ts`
Expected: all tests PASS, including the 5 new ones and every pre-existing test in this file.

- [ ] **Step 6: Run the full worker test suite**

Run: `npx vitest run`
Expected: all tests PASS (this file's changes to `r2.ts` are also exercised indirectly by `browse.test.ts`'s delete tests).

- [ ] **Step 7: Typecheck and lint**

Run: `npx tsc -b && npx eslint worker/lib/r2.ts worker/routes/upload.ts worker/routes/upload.test.ts`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add worker/lib/r2.ts worker/routes/upload.ts worker/routes/upload.test.ts
git commit -m "feat: support updating an existing artifact via id in /api/upload"
```

---

### Task 2: Server — fix cache-control so updated files aren't served stale

**Files:**
- Modify: `worker/routes/browse.ts:17,140,192` (the `IMMUTABLE_CACHE_CONTROL` constant and both its usages)
- Test: `worker/routes/browse.test.ts:144-148`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — this only changes a header value used internally by `serveFile` and `renderMarkdownFile`.

- [ ] **Step 1: Write the failing test**

In `worker/routes/browse.test.ts`, replace:

```ts
  it("sets immutable long-lived caching on file bytes", async () => {
    const { url } = await upload("file", [{ name: "safe.txt", content: "safe" }]);
    const response = await exports.default.fetch(`https://artifacts.example.com${url}safe.txt`);
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  });
```

with:

```ts
  it("serves file bytes with a revalidate-always cache policy, since files can be updated in place", async () => {
    const { url } = await upload("file", [{ name: "safe.txt", content: "safe" }]);
    const response = await exports.default.fetch(`https://artifacts.example.com${url}safe.txt`);
    expect(response.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");
    expect(response.headers.get("etag")).toBeTruthy();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run worker/routes/browse.test.ts -t "revalidate-always"`
Expected: FAIL — actual header is still `public, max-age=31536000, immutable`.

- [ ] **Step 3: Update the constant**

In `worker/routes/browse.ts`, replace:

```ts
const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";
```

with:

```ts
// Files can now be updated in place (see the artifact re-upload feature), so
// responses must always revalidate rather than being cached as immutable -
// the strong ETag (set alongside this on raw file responses) still makes an
// unchanged file's revalidation a cheap 304.
const FILE_CACHE_CONTROL = "public, max-age=0, must-revalidate";
```

Then update its two usages (both currently read `"Cache-Control": IMMUTABLE_CACHE_CONTROL,`) to read `"Cache-Control": FILE_CACHE_CONTROL,`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run worker/routes/browse.test.ts`
Expected: all tests in this file PASS.

- [ ] **Step 5: Run the full worker test suite**

Run: `npx vitest run`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add worker/routes/browse.ts worker/routes/browse.test.ts
git commit -m "fix: stop caching artifact files as immutable now that they can be updated"
```

---

### Task 3: Viewer UI — Upload button beside the title

**Files:**
- Modify: `worker/routes/browse.ts` (`renderArtifactViewerPage`'s header markup, a new `UPLOAD_SCRIPT` constant)
- Test: `worker/routes/browse.test.ts`

**Interfaces:**
- Consumes: `/api/upload` accepting `mode=directory` + `id` (Task 1).
- Produces: no new exported functions — purely rendered markup/script.

- [ ] **Step 1: Write the failing tests**

Append to the `"GET /a/:id/* : two-pane viewer"` describe block in `worker/routes/browse.test.ts`:

```ts
  it("renders an upload control wired to the current artifact id and path, at the root", async () => {
    const { url, id } = await upload("file", [{ name: "notes.txt", content: "hello" }]);
    const html = await (await exports.default.fetch(`https://artifacts.example.com${url}`)).text();

    expect(html).toContain(`data-upload-id="${id}"`);
    expect(html).toContain(`data-upload-path=""`);
    expect(html).toContain('type="file"');
  });

  it("scopes the upload control to the current subfolder's path", async () => {
    const { url, id } = await upload("directory", [{ name: "assets/logo.png", content: new Uint8Array([1]) }]);
    const html = await (await exports.default.fetch(`https://artifacts.example.com${url}assets/`)).text();

    expect(html).toContain(`data-upload-id="${id}"`);
    expect(html).toContain(`data-upload-path="assets/"`);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run worker/routes/browse.test.ts -t "upload control"`
Expected: FAIL — no `data-upload-id`/`data-upload-path` attributes exist yet.

- [ ] **Step 3: Add the Upload button and hidden file input to the header markup**

In `worker/routes/browse.ts`, inside `renderArtifactViewerPage`, replace:

```ts
  <div class="header-actions">
    <button class="btn" data-share>Share</button>
    ${isRoot ? `<button class="btn danger" data-delete-artifact="${escapeHtml(id)}">Delete artifact</button>` : ""}
  </div>
```

with:

```ts
  <div class="header-actions">
    <button class="btn" data-upload data-upload-id="${escapeHtml(id)}" data-upload-path="${escapeHtml(subPath)}">Upload</button>
    <input type="file" id="upload-input" multiple hidden>
    <button class="btn" data-share>Share</button>
    ${isRoot ? `<button class="btn danger" data-delete-artifact="${escapeHtml(id)}">Delete artifact</button>` : ""}
  </div>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run worker/routes/browse.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Add the upload wiring script (no test — behavior only observable in a real browser; covered by the manual smoke test in Task 7)**

In `worker/routes/browse.ts`, add a new constant near `SHARE_SCRIPT`/`DELETE_SCRIPT`:

```ts
const UPLOAD_SCRIPT = `
<script>
  document.querySelectorAll('[data-upload]').forEach((btn) => {
    const input = document.getElementById('upload-input');
    if (!input) return;
    const originalLabel = btn.textContent;

    btn.addEventListener('click', () => input.click());

    input.addEventListener('change', async () => {
      const files = Array.from(input.files || []);
      if (files.length === 0) return;

      const artifactId = btn.getAttribute('data-upload-id');
      const subPath = btn.getAttribute('data-upload-path') || '';
      const form = new FormData();
      form.set('mode', 'directory');
      form.set('id', artifactId);
      for (const file of files) {
        form.append('files', file, subPath + file.name);
      }

      btn.disabled = true;
      btn.textContent = 'Uploading…';
      try {
        const res = await fetch('/api/upload', { method: 'POST', body: form });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body.success) {
          alert(body.error || 'Upload failed.');
          btn.disabled = false;
          btn.textContent = originalLabel;
          input.value = '';
          return;
        }
        window.location.reload();
      } catch (err) {
        alert('Upload failed.');
        btn.disabled = false;
        btn.textContent = originalLabel;
        input.value = '';
      }
    });
  });
</script>`;
```

Then, still in `renderArtifactViewerPage`, add it to the body template — replace:

```ts
${PREVIEW_SCRIPT}
${SHARE_SCRIPT}
${DELETE_SCRIPT}`;
```

with:

```ts
${PREVIEW_SCRIPT}
${UPLOAD_SCRIPT}
${SHARE_SCRIPT}
${DELETE_SCRIPT}`;
```

- [ ] **Step 6: Run the full worker test suite**

Run: `npx vitest run`
Expected: all tests PASS.

- [ ] **Step 7: Typecheck and lint**

Run: `npx tsc -b && npx eslint worker/routes/browse.ts worker/routes/browse.test.ts`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add worker/routes/browse.ts worker/routes/browse.test.ts
git commit -m "feat: add an Upload button to the artifact viewer page"
```

---

### Task 4: CLI — state, args, and update-decision modules (pure logic, unit tested)

**Files:**
- Create: `cli/src/state.ts`
- Test: `cli/src/state.test.ts`
- Create: `cli/src/args.ts`
- Test: `cli/src/args.test.ts`
- Create: `cli/src/plan.ts`
- Test: `cli/src/plan.test.ts`
- Create: `cli/vitest.config.ts`
- Modify: `cli/package.json` (add `vitest` devDependency, `test`/`test:watch` scripts)

**Interfaces:**
- Produces (`state.ts`): `interface StateEntry { id: string; url: string; updatedAt: string }`, `defaultStatePath(): string`, `loadState(statePath: string): Record<string, StateEntry>`, `saveState(statePath: string, state: Record<string, StateEntry>): void`, `getEntry(statePath: string, server: string, absolutePath: string): StateEntry | undefined`, `setEntry(statePath: string, server: string, absolutePath: string, entry: StateEntry): void`, `removeEntry(statePath: string, server: string, absolutePath: string): void`.
- Produces (`args.ts`): `const DEFAULT_SERVER: string`, `interface Args { command: "upload" | "update"; targetPath: string; server: string; extract: boolean; name?: string; forceNew: boolean; id?: string }`, `parseArgs(argv: string[]): Args`.
- Produces (`plan.ts`): `class NoSavedArtifactError extends Error {}`, `type UploadPlan = { action: "create" } | { action: "update"; id: string }`, `planUpload(args: Args, existing: StateEntry | undefined): UploadPlan`.
- Consumes (`plan.ts`): `Args` from `./args.js`, `StateEntry` from `./state.js`.

- [ ] **Step 1: Add a test runner to the CLI package**

Run inside `cli/`: `npm install --save-dev vitest`

Create `cli/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
});
```

In `cli/package.json`, add to `"scripts"`:

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 2: Write the failing tests for `state.ts`**

Create `cli/src/state.test.ts`:

```ts
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getEntry, removeEntry, setEntry } from "./state.js";

let dir: string;
let statePath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "drop-share-test-"));
  statePath = join(dir, "state.json");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("state", () => {
  it("returns undefined for a path with no saved entry", () => {
    expect(getEntry(statePath, "https://example.com", "/some/path")).toBeUndefined();
  });

  it("round-trips a saved entry through separate calls", () => {
    setEntry(statePath, "https://example.com", "/some/path", {
      id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      url: "/a/01ARZ3NDEKTSV4RRFFQ69G5FAV/",
      updatedAt: "2026-08-24T00:00:00.000Z",
    });

    const entry = getEntry(statePath, "https://example.com", "/some/path");
    expect(entry?.id).toBe("01ARZ3NDEKTSV4RRFFQ69G5FAV");
  });

  it("keeps entries for different servers separate even for the same local path", () => {
    setEntry(statePath, "https://a.example.com", "/some/path", {
      id: "id-a",
      url: "/a/id-a/",
      updatedAt: "2026-08-24T00:00:00.000Z",
    });
    setEntry(statePath, "https://b.example.com", "/some/path", {
      id: "id-b",
      url: "/a/id-b/",
      updatedAt: "2026-08-24T00:00:00.000Z",
    });

    expect(getEntry(statePath, "https://a.example.com", "/some/path")?.id).toBe("id-a");
    expect(getEntry(statePath, "https://b.example.com", "/some/path")?.id).toBe("id-b");
  });

  it("removes an entry so it no longer resolves", () => {
    setEntry(statePath, "https://example.com", "/some/path", {
      id: "id-a",
      url: "/a/id-a/",
      updatedAt: "2026-08-24T00:00:00.000Z",
    });
    removeEntry(statePath, "https://example.com", "/some/path");

    expect(getEntry(statePath, "https://example.com", "/some/path")).toBeUndefined();
  });

  it("treats a missing state file as empty state rather than throwing", () => {
    const missingPath = join(dir, "does-not-exist", "state.json");
    expect(getEntry(missingPath, "https://example.com", "/some/path")).toBeUndefined();
  });

  it("treats malformed JSON as empty state rather than throwing", () => {
    writeFileSync(statePath, "not valid json{{{");
    expect(getEntry(statePath, "https://example.com", "/some/path")).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd cli && npx vitest run src/state.test.ts`
Expected: FAIL with a module-not-found error for `./state.js`.

- [ ] **Step 4: Implement `state.ts`**

Create `cli/src/state.ts`:

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface StateEntry {
  id: string;
  url: string;
  updatedAt: string;
}

type State = Record<string, StateEntry>;

export function defaultStatePath(): string {
  return join(homedir(), ".drop-share", "state.json");
}

function stateKey(server: string, absolutePath: string): string {
  return `${server}|${absolutePath}`;
}

export function loadState(statePath: string): State {
  if (!existsSync(statePath)) return {};
  try {
    const parsed: unknown = JSON.parse(readFileSync(statePath, "utf-8"));
    return typeof parsed === "object" && parsed !== null ? (parsed as State) : {};
  } catch {
    return {};
  }
}

export function saveState(statePath: string, state: State): void {
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, JSON.stringify(state, null, 2));
}

export function getEntry(statePath: string, server: string, absolutePath: string): StateEntry | undefined {
  return loadState(statePath)[stateKey(server, absolutePath)];
}

export function setEntry(statePath: string, server: string, absolutePath: string, entry: StateEntry): void {
  const state = loadState(statePath);
  state[stateKey(server, absolutePath)] = entry;
  saveState(statePath, state);
}

export function removeEntry(statePath: string, server: string, absolutePath: string): void {
  const state = loadState(statePath);
  delete state[stateKey(server, absolutePath)];
  saveState(statePath, state);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd cli && npx vitest run src/state.test.ts`
Expected: all tests PASS.

- [ ] **Step 6: Write the failing tests for `args.ts`**

Create `cli/src/args.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseArgs } from "./args.js";

describe("parseArgs", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses a basic upload command", () => {
    const args = parseArgs(["upload", "./photo.png"]);
    expect(args.command).toBe("upload");
    expect(args.targetPath.endsWith("photo.png")).toBe(true);
    expect(args.forceNew).toBe(false);
    expect(args.id).toBeUndefined();
  });

  it("parses --new on upload", () => {
    const args = parseArgs(["upload", "./photo.png", "--new"]);
    expect(args.forceNew).toBe(true);
  });

  it("parses update with --id", () => {
    const args = parseArgs(["update", "./photo.png", "--id", "01ARZ3NDEKTSV4RRFFQ69G5FAV"]);
    expect(args.command).toBe("update");
    expect(args.id).toBe("01ARZ3NDEKTSV4RRFFQ69G5FAV");
  });

  it("parses --server and --extract", () => {
    const args = parseArgs(["upload", "./release.zip", "--server", "https://example.com/", "--extract"]);
    expect(args.server).toBe("https://example.com");
    expect(args.extract).toBe(true);
  });

  it("exits with a usage error for an unrecognized command", () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => parseArgs(["frobnicate", "./photo.png"])).toThrow("exit");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("exits with a usage error for an unknown flag", () => {
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => parseArgs(["upload", "./photo.png", "--bogus"])).toThrow("exit");
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `cd cli && npx vitest run src/args.test.ts`
Expected: FAIL with a module-not-found error for `./args.js`.

- [ ] **Step 8: Implement `args.ts`**

Create `cli/src/args.ts`:

```ts
import { resolve } from "node:path";

export const DEFAULT_SERVER = "https://artifacts.msar.dev";

export interface Args {
  command: "upload" | "update";
  targetPath: string;
  server: string;
  extract: boolean;
  name?: string;
  forceNew: boolean;
  id?: string;
}

function printUsageAndExit(): never {
  console.error("Usage: drop-share upload <path> [--server <url>] [--extract] [--name <name>] [--new]");
  console.error("       drop-share update <path> [--server <url>] [--extract] [--id <id>]");
  console.error("");
  console.error(`Environment: ARTIFACT_SERVER can be set instead of passing --server.`);
  console.error(`Defaults to ${DEFAULT_SERVER} if neither is given.`);
  process.exit(1);
}

export function parseArgs(argv: string[]): Args {
  const [command, rawTargetPath, ...rest] = argv;
  if ((command !== "upload" && command !== "update") || !rawTargetPath) {
    printUsageAndExit();
  }

  let server = process.env.ARTIFACT_SERVER ?? DEFAULT_SERVER;
  let extract = false;
  let name: string | undefined;
  let forceNew = false;
  let id: string | undefined;

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--server") {
      server = rest[++i] ?? server;
    } else if (arg === "--extract") {
      extract = true;
    } else if (arg === "--name") {
      name = rest[++i];
    } else if (arg === "--new" && command === "upload") {
      forceNew = true;
    } else if (arg === "--id" && command === "update") {
      id = rest[++i];
    } else {
      console.error(`Unknown option: ${arg}`);
      printUsageAndExit();
    }
  }

  return {
    command,
    targetPath: resolve(rawTargetPath),
    server: server.replace(/\/+$/, ""),
    extract,
    name,
    forceNew,
    id,
  };
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `cd cli && npx vitest run src/args.test.ts`
Expected: all tests PASS.

- [ ] **Step 10: Write the failing tests for `plan.ts`**

Create `cli/src/plan.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Args } from "./args.js";
import { NoSavedArtifactError, planUpload } from "./plan.js";

function makeArgs(overrides: Partial<Args> = {}): Args {
  return {
    command: "upload",
    targetPath: "/abs/photo.png",
    server: "https://example.com",
    extract: false,
    forceNew: false,
    ...overrides,
  };
}

describe("planUpload", () => {
  it("creates fresh when uploading with no saved entry", () => {
    expect(planUpload(makeArgs(), undefined)).toEqual({ action: "create" });
  });

  it("updates the saved artifact when uploading a previously-published path", () => {
    const existing = { id: "01ARZ3NDEKTSV4RRFFQ69G5FAV", url: "/a/01ARZ3NDEKTSV4RRFFQ69G5FAV/", updatedAt: "x" };
    expect(planUpload(makeArgs(), existing)).toEqual({ action: "update", id: existing.id });
  });

  it("creates fresh even with a saved entry when --new is passed", () => {
    const existing = { id: "01ARZ3NDEKTSV4RRFFQ69G5FAV", url: "/a/01ARZ3NDEKTSV4RRFFQ69G5FAV/", updatedAt: "x" };
    expect(planUpload(makeArgs({ forceNew: true }), existing)).toEqual({ action: "create" });
  });

  it("update command uses the saved entry's id when --id isn't given", () => {
    const existing = { id: "01ARZ3NDEKTSV4RRFFQ69G5FAV", url: "/a/01ARZ3NDEKTSV4RRFFQ69G5FAV/", updatedAt: "x" };
    expect(planUpload(makeArgs({ command: "update" }), existing)).toEqual({ action: "update", id: existing.id });
  });

  it("update command prefers an explicit --id over the saved entry", () => {
    const existing = { id: "saved-id", url: "/a/saved-id/", updatedAt: "x" };
    expect(planUpload(makeArgs({ command: "update", id: "explicit-id" }), existing)).toEqual({
      action: "update",
      id: "explicit-id",
    });
  });

  it("update command throws without any saved entry or --id, making no network call", () => {
    expect(() => planUpload(makeArgs({ command: "update" }), undefined)).toThrow(NoSavedArtifactError);
  });
});
```

- [ ] **Step 11: Run test to verify it fails**

Run: `cd cli && npx vitest run src/plan.test.ts`
Expected: FAIL with a module-not-found error for `./plan.js`.

- [ ] **Step 12: Implement `plan.ts`**

Create `cli/src/plan.ts`:

```ts
import type { Args } from "./args.js";
import type { StateEntry } from "./state.js";

export class NoSavedArtifactError extends Error {}

export type UploadPlan = { action: "create" } | { action: "update"; id: string };

export function planUpload(args: Args, existing: StateEntry | undefined): UploadPlan {
  if (args.command === "update") {
    const id = args.id ?? existing?.id;
    if (!id) {
      throw new NoSavedArtifactError(
        `No saved artifact found for ${args.targetPath} on ${args.server}. Run "drop-share upload ${args.targetPath}" first.`,
      );
    }
    return { action: "update", id };
  }

  if (!args.forceNew && existing) {
    return { action: "update", id: existing.id };
  }

  return { action: "create" };
}
```

- [ ] **Step 13: Run test to verify it passes**

Run: `cd cli && npx vitest run src/plan.test.ts`
Expected: all tests PASS.

- [ ] **Step 14: Run the full CLI test suite**

Run: `cd cli && npx vitest run`
Expected: all tests in `state.test.ts`, `args.test.ts`, and `plan.test.ts` PASS.

- [ ] **Step 15: Commit**

```bash
cd cli
git add package.json package-lock.json vitest.config.ts src/state.ts src/state.test.ts src/args.ts src/args.test.ts src/plan.ts src/plan.test.ts
git commit -m "feat(cli): add state, args, and update-decision modules with tests"
```

---

### Task 5: CLI — wire `update` into `index.ts`, keep `upload` backward compatible

**Files:**
- Modify: `cli/src/index.ts` (whole file)
- Modify: `cli/README.md` (usage section)

**Interfaces:**
- Consumes: `defaultStatePath`, `getEntry`, `setEntry`, `removeEntry` from `./state.js` (Task 4); `parseArgs`, `Args`, `DEFAULT_SERVER` from `./args.js` (Task 4); `planUpload`, `NoSavedArtifactError`, `UploadPlan` from `./plan.js` (Task 4).
- Produces: the `drop-share` binary's runtime behavior — no new exports (this is the CLI entry point).

- [ ] **Step 1: Rewrite `cli/src/index.ts` in full**

Replace the entire file with:

```ts
#!/usr/bin/env node
import { basename, join } from "node:path";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { type Args, parseArgs } from "./args.js";
import { NoSavedArtifactError, type UploadPlan, planUpload } from "./plan.js";
import { defaultStatePath, getEntry, removeEntry, setEntry } from "./state.js";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_ARTIFACT_SIZE_BYTES = 10 * 1024 * 1024;

type UploadMode = "file" | "zip" | "zip-extract" | "directory";

interface DirectoryEntry {
  relativePath: string;
  absolutePath: string;
  size: number;
}

interface UploadResult {
  id: string;
  url: string;
}

class UploadHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "UploadHttpError";
  }
}

function formatBytes(bytes: number): string {
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

/** Recursively lists files under a local directory as safe, POSIX-style relative paths. Symlinks are skipped. */
function enumerateDirectory(root: string): DirectoryEntry[] {
  const entries: DirectoryEntry[] = [];

  function walk(dir: string, relativePrefix: string): void {
    for (const dirent of readdirSync(dir, { withFileTypes: true })) {
      const absolutePath = join(dir, dirent.name);
      const relativePath = relativePrefix ? `${relativePrefix}/${dirent.name}` : dirent.name;

      if (dirent.isSymbolicLink()) {
        console.error(`Skipping symlink: ${relativePath}`);
        continue;
      }
      if (dirent.isDirectory()) {
        walk(absolutePath, relativePath);
      } else if (dirent.isFile()) {
        entries.push({ relativePath, absolutePath, size: statSync(absolutePath).size });
      }
    }
  }

  walk(root, "");
  return entries;
}

function validateFileSize(size: number, label: string): void {
  if (size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`"${label}" is ${formatBytes(size)}, exceeding the 10 MB maximum file size`);
  }
}

function validateDirectorySizes(entries: DirectoryEntry[]): number {
  let total = 0;
  for (const entry of entries) {
    validateFileSize(entry.size, entry.relativePath);
    total += entry.size;
  }
  if (total > MAX_ARTIFACT_SIZE_BYTES) {
    throw new Error(`Total size is ${formatBytes(total)}, exceeding the 10 MB maximum artifact size`);
  }
  return total;
}

async function postUpload(server: string, form: FormData): Promise<UploadResult> {
  const response = await fetch(`${server}/api/upload`, { method: "POST", body: form });
  let body: { success?: boolean; id?: string; url?: string; error?: string };
  try {
    body = (await response.json()) as typeof body;
  } catch {
    throw new UploadHttpError(response.status, `Upload failed (HTTP ${response.status})`);
  }
  if (!response.ok || !body.success || !body.id || !body.url) {
    throw new UploadHttpError(response.status, body.error ?? `Upload failed (HTTP ${response.status})`);
  }
  return { id: body.id, url: body.url };
}

async function uploadSingleFile(
  server: string,
  absolutePath: string,
  mode: UploadMode,
  displayName: string,
  artifactId: string | undefined,
): Promise<UploadResult> {
  const form = new FormData();
  form.set("mode", mode);
  if (artifactId) form.set("id", artifactId);
  form.append("files", new Blob([readFileSync(absolutePath)]), displayName);
  return postUpload(server, form);
}

async function uploadDirectory(
  server: string,
  entries: DirectoryEntry[],
  artifactId: string | undefined,
): Promise<UploadResult> {
  const form = new FormData();
  form.set("mode", "directory");
  if (artifactId) form.set("id", artifactId);
  for (const entry of entries) {
    form.append("files", new Blob([readFileSync(entry.absolutePath)]), entry.relativePath);
  }
  return postUpload(server, form);
}

function printResult(server: string, result: UploadResult, label: string): void {
  console.log("");
  console.log("Upload complete.");
  console.log("");
  console.log(label);
  console.log(`${server}${result.url}`);
}

async function performUpload(args: Args, artifactId: string | undefined): Promise<UploadResult> {
  const stats = statSync(args.targetPath, { throwIfNoEntry: false });
  if (!stats) {
    console.error(`No such file or directory: ${args.targetPath}`);
    process.exit(1);
  }

  if (stats.isDirectory()) {
    const entries = enumerateDirectory(args.targetPath);
    if (entries.length === 0) {
      console.error("Directory contains no files to upload.");
      process.exit(1);
    }
    const totalSize = validateDirectorySizes(entries);
    console.log(
      `Uploading ${basename(args.targetPath)}/ (${entries.length} files, ${formatBytes(totalSize)}) to ${args.server}...`,
    );
    return uploadDirectory(args.server, entries, artifactId);
  }

  const displayName = args.name ?? basename(args.targetPath);
  const isZip = displayName.toLowerCase().endsWith(".zip");
  const mode: UploadMode = isZip ? (args.extract ? "zip-extract" : "zip") : "file";
  validateFileSize(stats.size, displayName);

  const modeLabel = mode === "zip-extract" ? " (extract & browse)" : "";
  console.log(`Uploading ${displayName} (${formatBytes(stats.size)})${modeLabel} to ${args.server}...`);
  return uploadSingleFile(args.server, args.targetPath, mode, displayName, artifactId);
}

/** Resolves the upload/update decision up front, exiting cleanly (no network call) if `update` has nothing to target. */
function resolvePlan(args: Args, existing: ReturnType<typeof getEntry>): UploadPlan {
  try {
    return planUpload(args, existing);
  } catch (error) {
    if (error instanceof NoSavedArtifactError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}

function saveResult(statePath: string, args: Args, result: UploadResult): void {
  setEntry(statePath, args.server, args.targetPath, {
    id: result.id,
    url: result.url,
    updatedAt: new Date().toISOString(),
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const statePath = defaultStatePath();
  const existing = getEntry(statePath, args.server, args.targetPath);
  const plan = resolvePlan(args, existing);

  const attemptId = plan.action === "update" ? plan.id : undefined;

  try {
    const result = await performUpload(args, attemptId);
    saveResult(statePath, args, result);
    printResult(args.server, result, plan.action === "update" ? "Updated artifact:" : "Artifact:");
    return;
  } catch (error) {
    // Re-throw anything that isn't "the artifact this update targeted is
    // gone" - including this guard clause narrows `plan` to the "update"
    // variant for the rest of this function, so `plan.id` below is safe.
    if (!(error instanceof UploadHttpError) || error.status !== 404 || plan.action !== "update") {
      throw error;
    }

    removeEntry(statePath, args.server, args.targetPath);
    if (args.command === "update") {
      console.error(`Artifact ${plan.id} no longer exists on ${args.server}.`);
      console.error(`Run "drop-share upload ${args.targetPath}" to publish a new one.`);
      process.exit(1);
    }
  }

  // Plain `upload` auto-detected a now-stale artifact - fall back to
  // publishing a fresh one instead of failing outright.
  const result = await performUpload(args, undefined);
  saveResult(statePath, args, result);
  printResult(args.server, result, "Artifact:");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
```

- [ ] **Step 2: Build and typecheck**

Run: `cd cli && npm run build`
Expected: compiles with no errors.

- [ ] **Step 3: Run the full CLI test suite (regression check)**

Run: `cd cli && npx vitest run`
Expected: all tests from Task 4 still PASS (this task doesn't add new unit tests — `main`/`performUpload`/`postUpload` are covered by manual smoke testing per the design spec, since they do real filesystem/network I/O).

- [ ] **Step 4: Manual smoke test against a local dev server**

In one terminal, from the repo root: `npx wrangler dev`

In another terminal, from `cli/`:

```bash
npm run build
echo "hello" > /tmp/drop-share-smoke.txt
node dist/index.js upload /tmp/drop-share-smoke.txt --server http://localhost:8787
```

Expected: prints `Artifact:` followed by a URL. Then:

```bash
echo "updated" > /tmp/drop-share-smoke.txt
node dist/index.js upload /tmp/drop-share-smoke.txt --server http://localhost:8787
```

Expected: prints `Updated artifact:` with the *same* URL as before (confirm by comparing the printed ids). Then:

```bash
node dist/index.js update /tmp/drop-share-smoke.txt --server http://localhost:8787
```

Expected: also prints `Updated artifact:` with the same id, and running it targets the same artifact without any state lookup ambiguity. Then:

```bash
rm -rf ~/.drop-share
node dist/index.js update /tmp/drop-share-smoke.txt --server http://localhost:8787
```

Expected: exits with a clear "No saved artifact found... Run \"drop-share upload ...\" first." error and makes no network request (check the `wrangler dev` terminal shows no new request logged for this command).

- [ ] **Step 5: Update `cli/README.md` usage section**

In `cli/README.md`, replace the `## Usage` section's command block and options table:

```
drop-share upload <path> [--server <url>] [--extract] [--name <name>]
```

| Argument / option    | Description |
|-----------------------|-------------|
| `<path>`              | File or folder to upload. Required. |
| `--server <url>`      | The drop-share server to upload to. Can be set via `ARTIFACT_SERVER` instead. Defaults to `https://artifacts.msar.dev` if neither is given. |
| `--extract`           | Only applies to a `.zip` file: extract it server-side into a browsable artifact instead of uploading it unchanged. |
| `--name <name>`       | Override the display/stored filename for a single-file upload. |

with:

```
drop-share upload <path> [--server <url>] [--extract] [--name <name>] [--new]
drop-share update <path> [--server <url>] [--extract] [--id <id>]
```

| Argument / option    | Description |
|-----------------------|-------------|
| `<path>`              | File or folder to upload. Required. |
| `--server <url>`      | The drop-share server to upload to. Can be set via `ARTIFACT_SERVER` instead. Defaults to `https://artifacts.msar.dev` if neither is given. |
| `--extract`           | Only applies to a `.zip` file: extract it server-side into a browsable artifact instead of uploading it unchanged. |
| `--name <name>`       | Override the display/stored filename for a single-file upload. |
| `--new` (`upload` only) | Force publishing a brand-new artifact even if this path was published before. |
| `--id <id>` (`update` only) | Update a specific artifact id directly, instead of looking up the one saved for this path. |

Running `drop-share upload <path>` again on a path you've published before **updates that same artifact** (adding new files, overwriting changed ones, leaving everything else untouched) instead of creating a new one — drop-share remembers what you published, in `~/.drop-share/state.json`. Use `drop-share update <path>` to be explicit about updating, or `--new` to force a fresh artifact.

- [ ] **Step 6: Commit**

```bash
cd cli
git add src/index.ts README.md
git commit -m "feat(cli): add update command and auto-update on re-upload"
```

---

### Task 6: Update the `publish-artifact` Claude Code skill

**Files:**
- Modify: `.claude/skills/publish-artifact/SKILL.md`

**Interfaces:** none (documentation only).

- [ ] **Step 1: Rewrite the SKILL.md instructions**

Replace the contents of `.claude/skills/publish-artifact/SKILL.md` with:

```markdown
---
name: publish-artifact
description: Upload a local file, ZIP, or folder to a drop-share server and report back its shareable URL. Re-running it on the same path updates that artifact instead of creating a new one.
argument-hint: "[path] [--extract] [--server <url>] [--name <name>] [--new]"
disable-model-invocation: true
allowed-tools: Bash
---

Publish a local artifact to drop-share.

1. If no path was given in the arguments, ask the user which file, ZIP, or
   folder to publish before running anything.
2. Otherwise run, using the Bash tool:

   ```
   npx --yes drop-and-share upload $ARGUMENTS
   ```

   (`--yes` skips npx's "ok to install this package?" prompt on a machine
   that hasn't run it before.)
3. If it succeeds, report back exactly the URL the command printed, as a
   clickable link. The command prints one of two labels right before the
   URL:
   - `Artifact:` — a brand-new artifact was created. Report it as
     "Published: <url>".
   - `Updated artifact:` — this local path was published before, so the
     existing artifact was updated in place (new/changed files added,
     everything else left alone). Report it as "Updated: <url>".
   Never invent or guess a URL - only report one that actually appeared in
   the command's output.
4. If it fails, show the user the exact error line from the command's
   output. Don't retry silently or reinterpret the error.

Reference notes (don't recite this whole block back to the user unless it's
directly relevant to what happened):

- `drop-and-share` is the published npm package name; the CLI binary it
  installs is `drop-share`. No install step is needed - `npx` handles it,
  the only prerequisite is Node.js 18+.
- drop-share remembers what a local path was published as (in
  `~/.drop-share/state.json`), so running `upload` again on the same path
  updates that same artifact rather than creating a new one. Pass `--new`
  to force a brand-new artifact instead. There's also an explicit
  `npx --yes drop-and-share update <path>` command, which fails clearly
  (without any network call) if that path was never published before.
- A `.zip` path uploads unchanged by default; add `--extract` to have the
  server extract it into a browsable artifact instead.
- If neither `--server <url>` is passed nor `ARTIFACT_SERVER` is set in the
  environment, uploads default to the maintainer's own instance
  (`https://artifacts.msar.dev`). That's fine for quick testing, but worth
  mentioning to the user if they seem to expect it to go somewhere else -
  point `--server` at their own drop-share deployment for anything else.
- Every artifact is capped at 10 MB (per file and in total, including
  previously-uploaded files when updating); the server enforces this
  regardless, so a failure here is a real limit, not a bug.
- There's no authentication: anyone who has an artifact's URL can update or
  delete it, exactly as they always could delete it. Don't treat a
  drop-share link as access-controlled.
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/publish-artifact/SKILL.md
git commit -m "docs: document update behavior in the publish-artifact skill"
```

---

### Task 7: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Run the full worker test suite**

Run: `npx vitest run`
Expected: all tests PASS (this now includes every test added in Tasks 1-3).

- [ ] **Step 2: Typecheck and lint the whole worker package**

Run: `npx tsc -b && npx eslint .`
Expected: no errors.

- [ ] **Step 3: Run the full CLI test suite**

Run: `cd cli && npx vitest run`
Expected: all tests PASS.

- [ ] **Step 4: Build the CLI**

Run: `cd cli && npm run build`
Expected: compiles with no errors.

- [ ] **Step 5: Manual UI smoke test for the Upload button**

Run `npx wrangler dev` from the repo root, then in a browser:

1. Upload a small file via the existing upload page (or `curl`) to get an artifact URL, and open `/a/<id>/`.
2. Confirm an "Upload" button appears beside the title.
3. Click it, pick a file with a name that doesn't already exist in the artifact — confirm the page reloads and the new file appears in the sidebar and is fetchable.
4. Click it again, pick a file whose name matches an existing file in the artifact but with different content — confirm the page reloads and fetching that file now returns the new content.
5. Browse into a subfolder (if the artifact has one) and repeat step 3 — confirm the uploaded file lands inside that subfolder, not at the artifact root.

Expected: all five behaviors match.

- [ ] **Step 6: Confirm no stray state from smoke testing**

Run: `rm -f /tmp/drop-share-smoke.txt`

(No commit for this task — it's verification only. If any step fails, fix the underlying issue in the relevant task's files and re-run that task's tests before returning here.)
