# drop-share

A personal artifact-sharing service on Cloudflare Workers + R2. Drop a file, a
ZIP, or a folder in the browser (or via the `drop-share` CLI) and get back an
immutable public URL.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/4msar/drop-share)
[![Cloudflare Deployment Status](https://img.shields.io/website?down_color=lightgrey&down_message=down&label=cloudflare%20deployment&logo=cloudflare&logoColor=white&up_color=orange&up_message=up&url=https%3A%2F%2Fartifacts.msar.dev%2Fapi%2Fhealth)](https://artifacts.msar.dev/api/health)
[![Cloudflare Deploy Check](https://img.shields.io/github/check-runs/4msar/drop-share/main?checkName=Cloudflare%20Workers&label=cloudflare%20deploy%20check)](https://github.com/4msar/drop-share/commits/main)

That button walks you through connecting your own Cloudflare account and
deploying this Worker from this repo. It still won't set your real domain
for you — see [Deploying](#deploying) for the couple of steps to finish
after it completes.

## How it works

- **Storage**: Cloudflare R2 is the only source of truth. There is no
  database, no KV, no manifest file. Every upload gets a fresh [ULID](https://github.com/ulid/spec)
  and its files are written directly to R2 as `<ulid>/<relative-path>`.
  Directory listings are computed on the fly from R2's own `list()` API
  (prefix + delimiter) — nothing about an artifact's structure is cached or
  duplicated anywhere.
- **Immutability**: an artifact's id is never reused, and uploading the same
  filename twice always produces two different ids with two stable URLs. The
  only way an artifact's URL stops resolving is if it is explicitly deleted.
- **Public, unauthenticated**: by explicit design, there is **no
  authentication** on this service — anyone who can reach the Worker can
  upload, browse, download, or delete any artifact by id. This is a
  deliberate simplification for a personal/trusted-network deployment, not an
  oversight. See "Security model" below for what that does and doesn't mean.

## URL structure

```
https://your-domain/                     upload UI (React)
https://your-domain/a/<ulid>/             artifact viewer: file list (left) + live preview (right)
https://your-domain/a/<ulid>/some/path    a specific file inside the artifact
```

`<ulid>` is a 26-character, sortable, cryptographically-random identifier. It
is never derived from the uploaded filename, so filenames never collide.

## Upload modes

One endpoint, `POST /api/upload` (`multipart/form-data`), with a `mode` field:

| mode          | when                                  | R2 result                                      |
| ------------- | ------------------------------------- | ---------------------------------------------- |
| `file`        | a single non-ZIP file                 | `<ulid>/<filename>`                            |
| `zip`         | a single `.zip`, stored unchanged     | `<ulid>/<filename>.zip` (served as a download) |
| `directory`   | a folder, or more than one loose file | `<ulid>/<relative/path>` per file              |
| `zip-extract` | a `.zip`, extracted server-side       | `<ulid>/<relative/path>` per extracted file    |

The browser shows a choice — **Upload ZIP** vs **Extract & Browse** — whenever
exactly one `.zip` is selected; "Upload ZIP" is the default. The CLI mirrors
this with `drop-share upload some.zip` (as-is) vs `drop-share upload
some.zip --extract`.

Other endpoints:

```
GET    /api/health              liveness check
GET    /api/artifact/:id        JSON listing of an artifact's files/folders
DELETE /api/artifact/:id        deletes every object under that artifact id
GET    /a/:id/                  human-facing browse/download page (see above)
```

## Limits

All configurable via `vars` in `wrangler.jsonc`, defaults shown:

```jsonc
"MAX_FILE_SIZE_BYTES": "10485760",       // 10 MB, per individual file
"MAX_ARTIFACT_SIZE_BYTES": "10485760",   // 10 MB, total per artifact (folder or extracted ZIP)
"MAX_ARTIFACT_FILE_COUNT": "2000",       // caps file count independent of byte size
"PUBLIC_BASE_URL": "https://artifacts.msar.dev"
```

Every limit is enforced **server-side**, before any object is written to R2:

- a cheap `Content-Length` check rejects grossly-oversized requests before
  parsing the multipart body at all;
- each file's exact size is checked as it's read from the parsed form;
- a running total (`SizeBudget`) enforces the whole-artifact cap;
- for ZIP extraction, the same running total is charged against **actual
  decompressed bytes as they're produced**, not against any size the archive
  claims about itself — see "ZIP security" below.

Oversized uploads get `413`. The browser and CLI also check sizes locally
first, purely for fast feedback — that check is never trusted on its own.

## ZIP security

ZIP extraction runs entirely inside the Worker using
[`fflate`](https://github.com/101arrowz/fflate) (pure JS, no native deps).
Before anything is decompressed:

- the ZIP's **central directory** is parsed and validated: entry count,
  compression method (only `stored`/`deflate` are allowed), the encrypted-entry
  flag, and — for archives built on a Unix host — the external attributes
  that mark a Unix symlink;
- every entry's path goes through the same traversal-safe normalizer used for
  regular directory uploads (rejects `..`, absolute paths, drive letters,
  backslashes, control characters);
- the central directory's own declared uncompressed size is checked against
  the artifact size limit as a cheap early rejection.

That last check is _not_ the real defense against zip bombs — a crafted
archive can simply lie about its own declared size. The real defense is that
decompression happens through `fflate`'s **streaming** inflate, with a shared
byte counter charged against every chunk of _actual_ decompressed output as
it's produced; the moment the running total would exceed the artifact-size
limit, extraction aborts immediately, regardless of what the archive's
metadata claimed. `worker/lib/zip.test.ts` has a regression test that
specifically crafts a ZIP with a falsified (too-small) declared size to prove
this path — not just the cheap metadata check — is what actually stops it.

## Security model (read this before deploying publicly)

**There is no authentication.** Anyone with network access to the Worker can
upload, browse, and delete artifacts. This is an explicit product decision
for a personal/trusted-audience tool, not a partial implementation — do not
deploy this to a domain you'd mind being used as an open drop box. If you
need access control later, the natural place to add it is
[Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/)
in front of the whole zone (no code changes needed), or an
`Authorization: Bearer` check re-added to `worker/routes/upload.ts` /
`handleArtifactDelete`.

**Untrusted content isolation, without a separate origin.** The original
design considered a separate `usercontent.*` subdomain so uploaded HTML/JS
could never run with the management UI's privileges. That was deliberately
simplified away, and HTML/images/etc. are meant to be directly viewable —
that's the point of the tool. Isolation instead comes from a narrower
realization: a browser only ever executes embedded `<script>` when it parses
a response _as HTML or SVG_. A `.js`/`.css` file opened directly just
displays as text; `<script src>`/`<img>`/`<link>` subresource loads ignore
`Content-Disposition` entirely and load regardless. So HTML and SVG are the
only two types that need real containment:

- Content-Type is always computed from the file extension server-side
  (`getContentType`), never trusted from the client's claimed MIME type.
- Everything on the "browser-friendly" list (`text/plain`, `text/css`,
  `text/javascript`, `text/html`, `application/json`, images, audio/video,
  `application/pdf`) is served `Content-Disposition: inline` — it renders
  directly in the browser. Only genuinely unrenderable/binary types (ZIP,
  gzip, tar, wasm, fonts, unknown extensions) are forced to download.
- **HTML and SVG responses additionally get `Content-Security-Policy:
sandbox allow-scripts allow-forms allow-popups
allow-popups-to-escape-sandbox allow-modals`.** Any embedded script still
  runs (so uploaded pages/demos work), but the CSP `sandbox` directive puts
  the document in a unique, opaque origin — deliberately _without_
  `allow-same-origin`. That means a script in an uploaded page cannot read
  this origin's cookies/storage, and any `fetch`/`XHR` it makes back to
  `/api/*` is treated as cross-origin (no `Access-Control-Allow-Origin` is
  ever set, so the browser blocks it from reading the response) — the same
  containment a separate subdomain would have given, achieved with one
  header instead of a second hostname.
- `X-Content-Type-Options: nosniff` is set on every file response so browsers
  can't override the declared type through content sniffing.
- Directory-listing pages HTML-escape every filename before rendering
  (`escapeHtml`), since a filename is attacker-controlled text.

**The artifact viewer** (`/a/:id/`) is a two-pane page: a file/folder list on
the left, a live preview pane on the right. Clicking a previewable file loads
it into an `<iframe>` on the right (client-side, no page reload) and
highlights it in the list; clicking a folder navigates normally. A file that
isn't previewable (a ZIP, a binary) has no click handler at all — the browser
just downloads it via the `Content-Disposition` set on that URL. The default
preview on load is `index.html` if one exists at that level, otherwise the
first previewable file, otherwise a placeholder. The preview iframe is just
pointed at the same `/a/:id/...` file URLs described above, so it inherits
all the same headers (sandbox CSP for HTML/SVG, correct content type, etc.) —
the viewer adds no new attack surface of its own.

**Other things checked**: path traversal and ZIP-slip (shared
`normalizeRelativePath`, exercised by both regular uploads and ZIP entries);
R2 key construction always goes through `buildObjectKey`, never raw string
concatenation of client input; `Content-Disposition` filenames are
percent-encoded via `filename*=UTF-8''...` and stripped of control characters
so a crafted filename can't inject header fields; no stack traces or internal
error details ever reach a client response (`jsonError` always returns a
flat `{ success, error }` message, and an unhandled exception anywhere in the
router is caught centrally and turned into a generic `500`).

**What's accepted as a tradeoff, given no auth**: since there's no session or
token, the traditional CSRF story doesn't really apply — any client, friendly
or hostile, has equal standing to upload or delete. No CORS headers are set,
so a script on another origin can't _read_ API responses, but a plain HTML
form can still POST an upload cross-origin (as it could against any
unauthenticated endpoint). This is a direct consequence of the "public,
no-auth" decision, not a separate bug.

## Project structure

```
drop-share/
├── worker/
│   ├── index.ts              router: /api/*, /a/:id/*, static asset fallback
│   ├── lib/
│   │   ├── ids.ts             ULID generation/validation
│   │   ├── paths.ts           safe relative-path normalization (traversal defense)
│   │   ├── validation.ts      size-limit primitives (PayloadTooLargeError, SizeBudget)
│   │   ├── contentType.ts     extension → MIME, inline-vs-download allowlist
│   │   ├── zip.ts             central-directory validation + streaming safe extraction
│   │   ├── r2.ts               R2 listing/delete helpers
│   │   └── http.ts            jsonOk/jsonError/escapeHtml
│   └── routes/
│       ├── upload.ts          POST /api/upload (all four modes)
│       ├── browse.ts          GET/DELETE for /a/:id/* and /api/artifact/:id
│       └── health.ts
├── src/                       React upload UI (Vite)
│   ├── App.tsx / App.css
│   └── upload.ts              drag/drop + directory-entry traversal, XHR upload w/ progress
├── cli/                       published to npm as drop-and-share (zero runtime deps)
│   └── src/index.ts
├── worker/**/*.test.ts        vitest (Workers runtime) unit + integration tests
├── .github/workflows/
│   └── publish-cli.yml        builds cli/ and runs `npm publish` on a cli-v* tag
├── .claude/skills/publish-artifact/SKILL.md  /publish-artifact in Claude Code (see below)
├── wrangler.jsonc
└── worker-configuration.d.ts  generated by `wrangler types` — do not hand-edit
```

## Local development

```bash
npm install
npm run dev          # starts the Cloudflare Vite plugin dev server (Worker + React app)
```

This runs entirely locally against a Miniflare-emulated R2 bucket — no
Cloudflare account or login is required for local development. Open
`http://localhost:5173` and drop a file. To exercise the API directly:

```bash
curl -F "mode=file" -F "files=@./photo.png" http://localhost:5173/api/upload
curl -F "mode=directory" -F "files=@index.html;filename=index.html" \
  -F "files=@style.css;filename=css/style.css" http://localhost:5173/api/upload
curl -X DELETE http://localhost:5173/api/artifact/<id>
```

Run the test suite and typecheck:

```bash
npm test        # vitest, runs inside the real Workers runtime (@cloudflare/vitest-plugin)
npm run build   # tsc -b && vite build — also serves as a full typecheck + production build
npm run lint
```

No secrets or `.dev.vars` are needed for this project — every configuration
value is a plain (non-secret) `vars` entry in `wrangler.jsonc`, since there is
no authentication token to store.

## The CLI

The `drop-share` CLI is published to npm as `drop-and-share` (the package
name; the command it installs is still `drop-share`), with zero runtime
dependencies (Node built-ins only: `fs`, `path`, global `fetch`/`FormData`).

**Use it with no install** (needs Node.js 18+):

```bash
npx drop-and-share upload ./photo.png --server https://your-domain
npx drop-and-share upload ./release.zip --extract --server https://your-domain
npx drop-and-share upload ./my-project/ --server https://your-domain
```

**Or install it once** for a persistent `drop-share` binary on your PATH:

```bash
npm install -g drop-and-share
drop-share upload ./photo.png --server https://your-domain
```

`ARTIFACT_SERVER` can be set instead of passing `--server` every time. If
neither is given, the CLI defaults to `https://artifacts.msar.dev` — this
maintainer's own instance. Since that server has no authentication (see
"Security model" above), leaving `--server`/`ARTIFACT_SERVER` unset means
anyone running this published CLI uploads to _that_ instance by default.
Point `--server` at your own deployment if you don't want that.

**Publishing a new CLI version** (maintainers): push a tag matching
`cli-v*` (e.g. `git tag cli-v0.2.0 && git push --tags`), or run the
"Publish CLI" workflow manually from the Actions tab with a version input.
`.github/workflows/publish-cli.yml` syncs `cli/package.json`'s version to
the tag, builds it, and runs `npm publish`. This needs an `NPM_TOKEN` repo
secret — an npm access token with publish rights to the `drop-and-share`
package, added under **Settings → Secrets and variables → Actions**.

**Building and running the CLI locally**, without publishing:

```bash
cd cli
npm install
npm run build
node dist/index.js upload ../README.md --server http://localhost:5173
```

## Claude Code integration

This repo ships a [Claude Code](https://claude.com/claude-code) skill at
`.claude/skills/publish-artifact/SKILL.md`. With this project open in Claude
Code, typing `/publish-artifact <path>` runs `npx drop-and-share upload
<path>` and reports back the resulting artifact URL — a quick way to share
a file, ZIP, or build output straight from a Claude Code session.

It's project-scoped, so it's only available when this repo is open. To use
it from _any_ project instead, copy the same file to your personal skills
directory:

```bash
mkdir -p ~/.claude/skills/publish-artifact
cp .claude/skills/publish-artifact/SKILL.md ~/.claude/skills/publish-artifact/SKILL.md
```

Global skill installation is also possible with a single command, without needing a local copy of this repo:

```bash
# Curl / wget command to install the skill from this repo directly (no local copy needed):
curl -fsSL https://raw.githubusercontent.com/4msar/drop-share/main/.claude/skills/publish-artifact/SKILL.md -o ~/.claude/skills/publish-artifact/SKILL.md

# Or, if you prefer wget:
wget -qO ~/.claude/skills/publish-artifact/SKILL.md https://raw.githubusercontent.com/4msar/drop-share/main/.claude/skills/publish-artifact/SKILL.md
```

Install in specific project directories by replacing `~/.claude/skills` with the path to that project. The skill is self-contained and doesn't depend on anything else in this repo, so it can be copied to any project directory and used there.

```bash
# Install the skill in a specific project directory
mkdir -p /path/to/project/.claude/skills/publish-artifact
cp .claude/skills/publish-artifact/SKILL.md /path/to/project/.claude/skills/publish-artifact/SKILL.md
```

That's also how anyone else using Claude Code can pick it up — the file is
self-contained and doesn't depend on anything else in this repo.

## Deploying

Via the **Deploy to Cloudflare** button above, or manually. Either way,
confirm these steps actually happened rather than assuming the button did
everything — it walks you through connecting your account and deploying the
Worker, but double-check the R2 bucket and domain below got set up:

1. Create the R2 bucket (name must match `bucket_name` in `wrangler.jsonc`,
   or edit it to match a bucket you already have):
    ```bash
    npx wrangler r2 bucket create drop-share-artifacts
    ```
2. Update `PUBLIC_BASE_URL` in `wrangler.jsonc` to your real domain.
3. Deploy:
    ```bash
    npm run deploy
    ```
4. In the Cloudflare dashboard, attach your domain to the Worker (**Workers &
   Pages → drop-share → Settings → Domains & Routes**), or add a `routes`
   entry to `wrangler.jsonc` and redeploy.
5. Verify: `curl https://your-domain/api/health`, then do a real upload
   through the browser UI and confirm the artifact URL it redirects to loads
   correctly over HTTPS.

This README does not claim these steps were run against a live Cloudflare
account in this session — only local (`wrangler dev` / Miniflare) verification
was performed. Treat the deploy steps as documentation to follow, and confirm
each one as you go.

## Known limitations

- **No Range/partial-content support** when serving files — every download
  serves the full body. Fine at a 10 MB artifact cap; would matter at larger
  sizes.
- **No authentication**, by design (see "Security model").
- **Directory-listing pages are not cached** (`Cache-Control: no-store`), so a
  deleted artifact's listing disappears immediately on reload — but the raw
  file bytes _are_ cached immutably for a year, so a client or CDN that
  already cached a specific file's response before a delete may still serve
  it until that cache entry expires. This is an inherent tension between
  "immutable, cache forever" and "deletable," and is accepted as documented
  behavior rather than solved.
- **Zip64 (>4 GB entries) is not specially parsed** — irrelevant at a 10 MB
  cap, but a zip64 sentinel size is treated as "definitely over the limit"
  rather than actually decoded.
- File-count and size limits apply per upload; there's no cross-artifact
  rate limiting (e.g., no cap on how many artifacts one client can create per
  minute).
