# Artifact re-upload / update design

Date: 2026-08-24

## Goal

Let a previously-uploaded artifact be updated in place — add new files or
overwrite existing ones under the same artifact id — instead of every
upload always minting a brand-new artifact. Exposed in three places:

1. The `/api/upload` worker endpoint (server-side capability).
2. An "Upload" button next to the title on the artifact viewer page
   (browser UI).
3. The `drop-share` CLI and its `publish-artifact` Claude Code skill
   (remembers which artifact a local path was published as, and updates it
   on a later run).

## Decisions already made (via user Q&A)

- **Auth model:** none. Same as today's delete endpoint — knowing an
  artifact's ULID is sufficient to update it. No new secret/token concept
  is introduced.
- **Merge semantics:** pure merge. A re-upload overwrites files whose
  relative path matches something already in the artifact, adds files at
  new paths, and leaves every other existing file untouched. Nothing is
  ever deleted by an update.
- **CLI state:** a single global state file under the user's home
  directory (not a marker file inside the uploaded folder), mapping
  `(server, absolute local path) -> artifact id`.
- **Update trigger:** both. `drop-share upload <path>` auto-detects a
  saved mapping and updates instead of creating (unless `--new` is
  passed); a new explicit `drop-share update <path>` command is also
  available.

## Cache-control change (required side effect)

Every file byte-response today sets:

```
Cache-Control: public, max-age=31536000, immutable
ETag: <r2 etag>
```

`immutable` tells the browser to never even attempt to revalidate for a
year. Once file content can change under the same URL, this is actively
wrong — clients that loaded a file before an update would keep serving
stale bytes.

**Change:** individual file responses switch to:

```
Cache-Control: public, max-age=0, must-revalidate
ETag: <r2 etag>
```

The ETag is unchanged (R2 recomputes it whenever an object's bytes
change). Browsers still cache bytes, but always issue a conditional
request first: a cheap `304` for untouched files, fresh bytes immediately
after an update. This is a deliberate, disclosed regression from
"zero requests after first load" to "one cheap revalidation per load," in
exchange for correctness.

This does **not** affect the directory-listing HTML page, which is
already `Cache-Control: no-store`.

The existing test `"sets immutable long-lived caching on file bytes"` in
`worker/routes/browse.test.ts` will be rewritten to assert the new header
value.

## Server: `worker/routes/upload.ts`

- `handleUpload` reads an optional `id` field from the form, alongside the
  existing `mode` and `files`.
- If `id` is present:
  - Reject with `400` if it's not a syntactically valid ULID
    (`isValidArtifactId`).
  - Look up all existing objects under `${id}/` (see `r2.ts` change
    below). If there are none, respond `404 Artifact not found` — update
    can only target an artifact that already exists; it never lets a
    caller choose their own id for a fresh artifact.
  - All four modes (`file`, `zip`, `directory`, `zip-extract`) accept this
    same `id` and, when present, write under that id's existing prefix
    instead of calling `generateArtifactId()`.
- Because R2 `put()` on an existing key simply overwrites it, "overwrite
  matches / add new / leave the rest" requires no diffing or explicit
  deletion — it falls out of writing exactly the paths in the current
  batch.
- **Limits still apply across updates.** Before writing, combine:
  - the size/count of existing objects whose relative path is *not* one
    of the paths this batch is about to overwrite (to avoid double
    counting), with
  - the size/count of the new batch,

  and check the combined totals against `MAX_ARTIFACT_SIZE_BYTES` /
  `MAX_ARTIFACT_FILE_COUNT`, throwing the same `PayloadTooLargeError` /
  `UploadValidationError` as today. This applies to `directory` and
  `zip-extract` (batch modes) as well as `file`/`zip` (single-file
  modes) — a single-file update can no longer silently push a
  directory-uploaded artifact over the cap.
- Response shape is unchanged: `{ success: true, id, url }`. For an
  update, `id`/`url` simply echo what was passed in.

## `worker/lib/r2.ts` change

`listAllArtifactKeys(bucket, artifactId)` currently returns `string[]` of
keys (used only by `deleteArtifact`). It changes to return
`{ key: string; size: number }[]` so upload.ts can compute existing
totals without a second bucket listing. `deleteArtifact` is updated to
map `.key` before batching deletes; its behavior is otherwise unchanged.

## Viewer UI: `worker/routes/browse.ts`

- A new button `<button class="btn" data-upload>Upload</button>` is added
  to `.header-actions`, before the `Share` button. Unlike `Delete
  artifact`, it is **not** gated to `isRoot` — it's shown on every
  artifact page (root or subfolder), because updating a deeply-nested
  file is a legitimate reason to browse into that subfolder first.
- The button (or a wrapping element) carries `data-upload-id="${id}"` and
  `data-upload-path="${subPath}"`.
- A hidden `<input type="file" multiple>` is added alongside it, triggered
  by the button's click.
- A new `UPLOAD_SCRIPT` (same inline-`<script>` style as `SHARE_SCRIPT` /
  `DELETE_SCRIPT`): on file selection, builds a `FormData` with
  `mode=directory`, `id=<artifactId>`, and appends each selected file
  under `files` with its filename set to `<currentSubPath><file.name>` —
  so uploading while browsing `assets/` lands new files inside `assets/`.
  POSTs to `/api/upload`. On success: `location.reload()`. On failure:
  `alert(<server error message>)`, matching the existing minimal
  error-handling style used by delete.
- Scope is explicitly individual file(s) via the native picker, not a
  folder tree / drag-and-drop — whole-folder publishing already exists
  via the CLI's `directory` mode.

## CLI: `cli/src/index.ts`

- New module-level state helpers, backed by `~/.drop-share/state.json`:
  - Shape: `{ [key: string]: { id: string; url: string; updatedAt: string } }`
    where `key = "<server>|<absolutePath>"`.
  - `loadState()`, `saveState()`, `getEntry(server, path)`,
    `setEntry(server, path, entry)`, `removeEntry(server, path)`. Read
    failures (missing file, malformed JSON) are treated as "no state" —
    never a hard error.
- `drop-share upload <path> [--server <url>] [--extract] [--name <name>] [--new]`:
  - Resolves the absolute path and server exactly as today.
  - If `--new` is not passed and a saved entry exists for
    `(server, absolutePath)`, this becomes an update against that id
    (same code path as `update`, below) instead of a fresh create. If
    that update fails specifically because the server responds `404`
    (the previously-published artifact no longer exists), `upload`
    clears the stale entry and falls back to creating a brand-new
    artifact, rather than failing outright — the point of plain `upload`
    is "get this published," not "error because my old link died." The
    explicit `update` command, by contrast, never falls back to create —
    its contract is update-or-fail (see below).
  - Otherwise: creates fresh as today, then saves/overwrites the state
    entry for `(server, absolutePath)` with the returned `id`/`url`.
  - `--new` forces a fresh create even when a saved entry exists, and
    then overwrites that saved entry with the new artifact — "detach and
    start over."
- New `drop-share update <path> [--server <url>] [--extract] [--id <id>]`:
  - If `--id` is given, targets that id directly (bypassing lookup).
  - Otherwise looks up the saved entry for `(server, absolutePath)`; if
    none exists, exits with a clear error (*"No saved artifact found for
    `<path>` on `<server>`. Run `drop-share upload <path>` first."*) and
    makes no network call.
  - Uploads exactly like `upload` (same directory-enumeration /
    single-file logic), but includes the target `id` in the form.
  - On a `404` response (artifact no longer exists server-side), removes
    the now-stale local entry and reports the error clearly.
  - On success, refreshes the saved entry (`updatedAt`, and `id`/`url` in
    case `--id` was used to redirect to a different artifact) and prints
    `Updated artifact:` followed by the URL — distinct from the `Artifact:`
    label used on a fresh create, so output is unambiguous about what
    happened.
  - `uploadDirectory` / `uploadSingleFile` gain a shared optional `id`
    parameter that just adds the form field; no logic duplication between
    create and update.

## `.claude/skills/publish-artifact/SKILL.md`

- Document that re-running the command against the same local path now
  updates the existing artifact automatically (add/overwrite files)
  instead of creating a new one each time.
- Document the new `drop-share update <path>` command and the `--new`
  flag on `upload`.
- Update the "report back the URL" instruction to look for either the
  `Artifact:` or `Updated artifact:` line the command printed, and to
  phrase the report appropriately ("Published" vs. "Updated").

## Testing

- `worker/routes/upload.test.ts`: new `describe("POST /api/upload: id=<existing>")` block —
  - overwrites an existing path's content, verified by re-fetching it
  - adds a new path alongside untouched existing ones (merge semantics)
  - `404`s when `id` doesn't correspond to any existing artifact
  - `400`s on a syntactically invalid `id`
  - rejects (413/400) when existing + new totals exceed
    `MAX_ARTIFACT_SIZE_BYTES` / `MAX_ARTIFACT_FILE_COUNT`, even though the
    new batch alone would be under the cap
- `worker/routes/browse.test.ts`:
  - rewritten cache-control test for the new header value
  - new test asserting the upload button/input render with the correct
    `data-upload-id` / `data-upload-path` on both a root and a subfolder
    page
- `cli/`: the package currently has no test runner at all. This adds a
  minimal `vitest` devDependency and unit tests (with `fetch` mocked at
  the global) for: state load/save round-trip, the upload-vs-update
  decision logic (`--new`, saved entry present/absent), and `update`'s
  no-network-call error path when no entry and no `--id` are given.
  Actual network behavior continues to be covered by manual smoke testing
  against a local `wrangler dev` instance, matching how the CLI has been
  verified so far.

## Out of scope

- Deleting files from an artifact that are no longer present locally
  (explicitly rejected in favor of pure merge).
- Any new authentication/ownership token.
- Folder/drag-and-drop upload from the browser UI (only individual files
  via the native picker).
- Rate limiting or abuse protection beyond what already exists.
