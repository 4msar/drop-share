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
5. If the current chat has already an artifact published, keep the id so next time you can use it for update or new upload.

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
