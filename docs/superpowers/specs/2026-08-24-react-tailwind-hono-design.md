# React + Tailwind frontend, Hono Worker routing

Date: 2026-08-24

## Goal

Two conversions to existing code, with no change to the public HTTP contract
beyond one additive API change:

1. The frontend becomes React + Tailwind. The Worker's server-rendered
   artifact viewer moves into the SPA, routed by react-router.
2. The Worker's hand-rolled regex dispatch becomes Hono routing.

## Division of responsibility

The URL grammar already encodes the split, so the boundary follows it:

- **trailing slash = a page** -> React (`/a/:id/`, `/a/:id/sub/`)
- **no trailing slash = bytes** -> Worker (`/a/:id/index.html`)

`/a/:id/index.html` is a document request the browser issues directly, so
React never sees it. No routing conflict needs engineering around.

The Worker keeps everything that must be served with artifact-aware headers:
raw file bytes, `Content-Disposition`, ETags, the sandbox CSP, and
server-side markdown -> HTML for the preview iframe.

## Worker routing (Hono)

`Hono<{ Bindings: Env }>` replaces the two regexes and the `pathname.match`
chain in `worker/index.ts`.

```
app.get('/api/health')             health
app.post('/api/upload')            upload
app.get('/api/artifact/:id')       listing JSON (?path= for subdirs)
app.delete('/api/artifact/:id')    delete
app.get|head('/a/:id/*')           bytes, or SPA shell for directory requests
app.all('/api/*')                  404 JSON
app.get('*')                       env.ASSETS.fetch
app.onError                        500 JSON (replaces the top-level try/catch)
```

Two behaviours are preserved deliberately rather than left to Hono defaults:

- **405, not 404, on method mismatch.** Hono 404s when a path matches but the
  method does not. An `app.all` registered per API path after the specific
  method restores the current 405.
- **Explicit percent-decoding.** The artifact sub-path is decoded once from the
  raw path, and a malformed encoding stays a deliberate 404. Hono's param
  helpers decode on their own; decoding from the raw path keeps unicode
  filenames and the malformed-input 404 behaving exactly as before.

## API surface

One additive change to `GET /api/artifact/:id`:

- optional `?path=sub/dir/` for subdirectory listings
- each file gains `previewable` and `markdown` booleans

The flags derive from `isInlineSafe`/`getContentType`, keeping the Worker the
single source of truth for what is safe to render inline. The security
predicate is not duplicated client-side. The route's existing response shape
is otherwise unchanged.

## Client structure

`src/App.tsx` (354 lines, everything) splits along the two routes:

```
src/App.tsx                BrowserRouter, 2 routes
src/routes/UploadPage.tsx  today's uploader
src/routes/ViewerPage.tsx  the two-pane viewer
src/components/            Button, DropZone, ProgressBar, FileList,
                           PreviewPane, SourceToggle
src/lib/upload.ts          moved from src/upload.ts
src/lib/artifact.ts        listing fetch + types
```

The viewer reimplements what the Worker's inline `<script>` blocks did:
default preview picks `index.html` else the first previewable file; markdown
gets a Show source / Show rendered toggle; per-item open-in-new-tab links;
Share (clipboard), Upload More, Delete. React escapes filenames as text
nodes, so the `escapeHtml` calls that guarded that markup are no longer
needed there.

Roughly 330 of `browse.ts`'s 581 lines - `pageShell`,
`renderArtifactViewerPage`, and the four inline script constants - are
deleted. `renderMarkdownPreviewPage` stays: the preview iframe needs
server-rendered, sandboxed markdown.

## Tailwind

Tailwind v4 via `@tailwindcss/vite`; tokens declared in `@theme` in
`index.css`; no `tailwind.config.js`. The existing custom properties become
theme tokens. Dark mode stays `prefers-color-scheme`, matching today - no
toggle. `App.css` is deleted. Arbitrary values snap to Tailwind's scale
(`rounded-[28px]` -> `rounded-3xl`, custom outlines ->
`focus-visible:ring-2`), so the result is visually close but not identical.

## Security invariants (must not regress)

- Uploaded HTML/SVG keeps `Content-Security-Policy: sandbox allow-scripts ...`
  with **no** `allow-same-origin`, so uploaded script stays in an opaque
  origin.
- Markdown is rendered to HTML **in the Worker**, under that same sandbox CSP.
  Rendering it in React would put markdown-embedded `<script>` on the app's
  own origin - a real XSS hole where today there is a sandbox. This is why
  client-side markdown rendering was rejected.
- Path traversal rejection, ETag/304, and `Content-Disposition` handling are
  untouched; that logic does not move.

## Testing

There is currently no client test infrastructure: one vitest project on the
Cloudflare workers pool, no DOM environment. Moving the viewer to React moves
11 tested behaviours out of a tested layer, so:

- `vitest.config.ts` becomes two `projects`: `worker/**` on the Cloudflare
  pool (unchanged), `src/**` on jsdom. `npm test` still runs both.
- New dev deps: `jsdom`, `@testing-library/react`.
- The 11 markup-assertion tests in `worker/routes/browse.test.ts` are
  **rewritten as component tests, not deleted**. What remains worker-side:
  `/a/:id/` serves the shell, and the listing API returns the right flags.
- File-serving tests (sandbox CSP, ETag/304, `Content-Disposition`,
  trailing-slash redirect, traversal rejection) are untouched.

## Accepted regressions

Signed off by the user:

- **First paint on a shared link.** Today the viewer is HTML in the first
  response; now it is shell -> JS -> fetch listing -> render.
- **No-JS clients and crawlers** see an empty shell instead of a file list.
- **One extra R2 `list({limit:1})`** per directory page view, to keep 404s
  honest. Serving the shell unconditionally would make `/a/does-not-exist/`
  return HTTP 200, which is worse for a paste-a-link service.

## Out of scope

- The CLI (`cli/`) uses only `/api/upload` and is unaffected.
- `src/upload.ts` hardcodes the 10 MB limits that `wrangler.jsonc` also
  declares. Pre-existing duplication; not addressed here.
