---
name: publish-artifact
description: Upload a local file, ZIP, or folder to a drop-share server and report back its shareable, immutable URL.
argument-hint: "[path] [--extract] [--server <url>] [--name <name>]"
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
3. If it succeeds, report back exactly the "Artifact:" URL the command
   printed, as a clickable link. Never invent or guess a URL - only report
   one that actually appeared in the command's output.
4. If it fails, show the user the exact error line from the command's
   output. Don't retry silently or reinterpret the error.

Reference notes (don't recite this whole block back to the user unless it's
directly relevant to what happened):

- `drop-and-share` is the published npm package name; the CLI binary it
  installs is `drop-share`. No install step is needed - `npx` handles it,
  the only prerequisite is Node.js 18+.
- A `.zip` path uploads unchanged by default; add `--extract` to have the
  server extract it into a browsable artifact instead.
- If neither `--server <url>` is passed nor `ARTIFACT_SERVER` is set in the
  environment, uploads default to the maintainer's own instance
  (`https://artifacts.msar.dev`). That's fine for quick testing, but worth
  mentioning to the user if they seem to expect it to go somewhere else -
  point `--server` at their own drop-share deployment for anything else.
- Every artifact is capped at 10 MB (per file and in total); the server
  enforces this regardless, so a failure here is a real limit, not a bug.
