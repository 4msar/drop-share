---
name: publish-artifact
description: Upload a local file, ZIP, or folder to a drop-share server and report back its shareable URL. Re-running it in the same directory updates that artifact instead of creating a new one.
argument-hint: "[path ...] [--extract] [--server <url>] [--name <name>] [--password <password>] [--token <token>] [--new]"
disable-model-invocation: true
allowed-tools: Bash
---

# drop-share

> Publish a local file, ZIP, or folder to a drop-share server and get back a
> public, shareable URL - no account required. Re-publishing from the same
> directory updates that artifact in place.

## How it works

1. Pick a file, several files, a `.zip`, or a folder.
2. The `drop-and-share` CLI uploads it to a drop-share server (Cloudflare
   Workers + R2).
3. You get a live artifact URL like `https://<server>/a/<id>/`.
4. drop-share remembers what each local directory was published as, so the
   next upload from there updates the same artifact instead of creating a
   new one.

## For AI agents

If no path was given in the arguments, ask the user which file, ZIP, or
folder to publish before running anything.

Otherwise publish with the Bash tool. No install step is needed - `npx`
handles it; the only prerequisite is Node.js 18+:

```sh
npx --yes drop-and-share upload $ARGUMENTS
```

(`--yes` skips npx's "ok to install this package?" prompt on a machine that
hasn't run it before.)

For uploads:

- Pass the final files to share - a build output directory such as `./dist`,
  a single file, or several files (bundled into one artifact; each must be a
  file, not a directory).
- A `.zip` uploads unchanged by default. Add `--extract` to have the server
  extract it into a browsable artifact.
- Use `--name <name>` only to rename a single-file upload.
- To update an existing artifact, just run `upload` again from the same
  path. Use `npx --yes drop-and-share update <path>` to be explicit - it
  fails clearly (with no network call) if that path was never published.
  Use `update <path> --id <id>` to target a specific artifact id.
- Use `--new` only when the user explicitly wants a separate, brand-new
  artifact.
- If the current chat has already published an artifact, keep its id and
  URL so later requests can update it (`--id <id>`) or deliberately create a
  new one (`--new`).
- If an update fails with an auth/forbidden error, the artifact is locked:
  ask the user for its password and rerun with `--password <password>`.
  Never guess or invent a password or token.
- If the user wants a new artifact protected, pass `--password <password>`
  on the upload; the CLI locks it right after creating it. `--password` and
  `--token` can't be combined.

After publishing, verify the live URL:

```sh
curl -sI <url>
```

If it initially returns 404, wait briefly and retry once before changing
anything.

Return the result based on the label the command printed right before the
URL:

- `Artifact:` - a brand-new artifact was created. Report "Published: <url>".
- `Updated artifact:` - the existing artifact was updated in place (new or
  changed files added, everything else left alone). Report
  "Updated: <url>".

Always report the URL exactly as printed, as a clickable link. Never invent
or guess a URL - only report one that actually appeared in the output.

If the command fails, show the user the exact error line from its output.
Don't retry silently or reinterpret the error. Size-limit errors are real
server limits, not bugs.

## Reference notes

Don't recite this block back to the user unless it's directly relevant to
what happened.

- `drop-and-share` is the npm package; the binary it installs is
  `drop-share`.
- Server selection: `--server <url>`, else `ARTIFACT_SERVER`, else the
  maintainer's own instance `https://artifacts.msar.dev`. That default is
  for quick testing only - mention it if the user seems to expect the upload
  to go somewhere else, and suggest `--server` pointing at their own
  deployment.
- Limits: 10 MB per file and 10 MB per artifact in total (including files
  already uploaded when updating). The server enforces this regardless of
  the CLI.
- State lives in `~/.drop-share/state.json` (keyed by server + directory;
  bundled files use their common parent directory). It also stores the
  derived lock token for protected artifacts.
- Security: artifacts have no authentication by default - anyone with the
  URL can view, update, or delete an unlocked artifact. Don't describe a
  drop-share link as access-controlled unless it was locked.
- Treat passwords and tokens as sensitive: never echo them back in chat,
  and never put a `?token=` URL in a link meant for sharing - it grants edit
  access. The password itself is never sent to the server; only
  `SHA-1("<id>:<password>")` is.

For details:

- `cli/README.md` in the drop-share repo (https://github.com/4msar/drop-share)
- https://www.npmjs.com/package/drop-and-share
