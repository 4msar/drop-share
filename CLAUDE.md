# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A personal artifact-sharing service on Cloudflare Workers + R2. Drop a file, a ZIP, or a folder in
the browser (or via the `drop-share` CLI in `cli/`) and get back a public URL — re-uploading in the
same directory later updates that artifact in place instead of creating a new one.

**By explicit design, there is no authentication by default** — anyone who can reach the Worker can
upload, browse, download, or delete any artifact by id. An opt-in, per-artifact lock exists (see
"Locking" below) but is not the default. Keep this in mind for anything you touch in `worker/routes/`.

## Commands

```bash
npm install
npm run dev                     # Cloudflare Vite plugin dev server (Worker + React), no CF account needed
npm run build                   # tsc -b && vite build — also serves as full typecheck
npm run lint                    # eslint .
npm run deploy                  # build + wrangler deploy
npm run cf-typegen              # regenerate worker-configuration.d.ts from wrangler.jsonc

npm test                        # both vitest projects: "worker" (real Workers runtime) + "client" (jsdom)
npm test -- --project worker    # just the Worker tests
npm test -- --project client    # just the React component tests
npm test -- worker/lib/zip.test.ts        # a single file
npm test -- -t "some test name"           # by test name
npm run test:watch              # vitest watch mode
```

No secrets or `.dev.vars` are needed — every config value is a plain (non-secret) `vars` entry in
`wrangler.jsonc`, since there's no auth token to store server-side.

The CLI (`cli/`) is a separate npm package (`drop-and-share`) with its own `package.json`:
```bash
cd cli && npm install && npm run build
node dist/index.js upload ../README.md --server http://localhost:5173
```

## Architecture

**Two runtimes, one repo, one Vite dev server** (`@cloudflare/vite-plugin`): `worker/` is the Hono
API running on workerd, `src/` is the React client. `vitest.config.ts` defines two separate test
projects for this reason — the worker's tests run against real R2/asset bindings via
`@cloudflare/vitest-plugin`, the client's need jsdom.

**R2 is the only source of truth.** No database, no KV, no manifest file. Every upload gets a fresh
ULID (`worker/lib/ids.ts`) and its files are written directly to R2 as `<ulid>/<relative-path>`.
Directory listings are computed on the fly from R2's `list()` API — nothing about an artifact's
structure is cached or duplicated. An artifact id is never reused.

**URL structure**: a path ending in `/` is a page (served by the React SPA shell, filled in from
`GET /api/artifact/:id`); a path without one is raw bytes, served by the Worker directly with that
file's own `Content-Type`/`Content-Disposition`/`ETag`/CSP. This split is why `wrangler.jsonc` sets
`assets.run_worker_first: true` — the Worker must see every request to apply per-object headers,
not just `/api/*`.

**Upload modes** — one endpoint, `POST /api/upload` (multipart), keyed by a `mode` field: `file`,
`zip` (stored unchanged), `directory`, `zip-extract` (extracted server-side). Every size/count limit
(`MAX_FILE_SIZE_BYTES`, `MAX_ARTIFACT_SIZE_BYTES`, `MAX_ARTIFACT_FILE_COUNT` in `wrangler.jsonc`'s
`vars`) is enforced server-side via a running `SizeBudget` (`worker/lib/validation.ts`), including
against actual decompressed bytes as they stream out of ZIP extraction — never against a ZIP's own
declared/claimed size. See `worker/lib/zip.ts` and its test for the zip-bomb regression case.

**Locking (opt-in, per-artifact protection)**: every artifact gets a hidden `.artifact.json` marker
(`worker/lib/artifactMeta.ts`) that is always filtered out of listings and 404s on direct request.
Locking is client-driven: the viewer prompts for a password, derives a token from it in the browser
(`hashPassword` in `src/lib/hash.ts` — `SHA-1("<artifactId>:<password>")`, artifact id as salt), and
sends only that derived token via `PATCH /api/artifact/:id` (`worker/routes/update.ts`, the single
route for every metadata mutation — label and/or lock). The plaintext password never leaves the
browser or gets stored. Once locked, mutations require `X-Artifact-Token` (or `?token=` for reads);
a metadata file that fails to parse is treated as protected/fails-closed, never unrestricted. The
token lives in the URL's `?token=` query param during a session and is saved to `localStorage`
(`src/lib/tokens.ts`, keyed by artifact id) after a successful lock/unlock so the Recent Switcher
retains modify access — the Share button strips `?token=` before copying a link specifically to
avoid handing out edit access by accident.

**HTML/SVG containment without a separate origin**: rather than isolating uploaded content on a
`usercontent.*` subdomain, HTML and SVG responses get
`Content-Security-Policy: sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals`
(no `allow-same-origin`), which puts them in a unique opaque origin — scripts still run, but can't
read this origin's cookies/storage or successfully call back to `/api/*`. Content-Type is always
computed server-side from the file extension (`worker/lib/contentType.ts`), never trusted from the
client. This is why markdown is still rendered by the Worker (`?render=html`) rather than in React:
rendering arbitrary embedded HTML/script client-side would execute it on the app's own origin.

**Path safety**: all R2 key construction goes through `buildObjectKey`/`normalizeRelativePath`
(`worker/lib/paths.ts`) — shared by regular directory uploads and ZIP-entry extraction — never raw
string concatenation of client input. Same normalizer defends both path traversal and ZIP-slip.

**Client-side `previewable` mirrors a server-computed flag**, not a re-implemented predicate — the
listing API returns `previewable` per file (derived from the same inline-safe allowlist the file
responses use), so the two can't drift apart. See `src/lib/artifact.ts` for listing fetch, sorting,
delete, and preview-selection logic shared across routes/components.

For the full security model (CSRF posture given no auth, header hardening, known limitations like
no Range support and no zip64), see `README.md` — it's kept current and is a better reference than
re-deriving this from the code each time.
