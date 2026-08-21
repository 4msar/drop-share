# drop-and-share

Command-line uploader for [drop-share](https://github.com/4msar/drop-share) —
upload a file, a ZIP, or a whole folder to a drop-share server and get back
an immutable artifact URL. Published to npm as `drop-and-share`; the command
it installs is `drop-share`.

Zero runtime dependencies: it only uses Node's own `fs`/`path` and the
global `fetch`/`FormData`/`Blob`.

## Requirements

- Node.js 18 or newer
- A drop-share server to upload to (self-hosted). If you don't set
  `--server`/`ARTIFACT_SERVER`, uploads go to this maintainer's own instance
  at `https://artifacts.msar.dev` by default — see the note below.

## Use it with no install

```bash
npx drop-and-share upload ./photo.png --server https://your-domain
```

## Or install it once

```bash
npm install -g drop-and-share
drop-share upload ./photo.png --server https://your-domain
```

This gives you a `drop-share` binary directly on your PATH.

## Usage

```
drop-share upload <path> [--server <url>] [--extract] [--name <name>]
```

| Argument / option    | Description |
|-----------------------|-------------|
| `<path>`              | File or folder to upload. Required. |
| `--server <url>`      | The drop-share server to upload to. Can be set via `ARTIFACT_SERVER` instead. Defaults to `https://artifacts.msar.dev` if neither is given. |
| `--extract`           | Only applies to a `.zip` file: extract it server-side into a browsable artifact instead of uploading it unchanged. |
| `--name <name>`       | Override the display/stored filename for a single-file upload. |

`ARTIFACT_SERVER` can be set in your shell profile so you don't have to pass
`--server` on every call:

```bash
export ARTIFACT_SERVER=https://your-domain
drop-share upload ./release.zip
```

> **Note:** if you don't pass `--server` and don't set `ARTIFACT_SERVER`,
> this CLI uploads to the maintainer's own server
> (`https://artifacts.msar.dev`) by default. That server has no
> authentication, so this is a convenience default, not a shared public
> service — point `--server` at your own drop-share deployment for anything
> beyond quick testing.

## Examples

```bash
# A single file
drop-share upload ./photo.png --server https://your-domain

# A ZIP, stored as-is (this is the default for .zip files)
drop-share upload ./release.zip --server https://your-domain

# A ZIP, extracted server-side into a browsable artifact
drop-share upload ./release.zip --extract --server https://your-domain

# A whole folder - relative paths inside it are preserved
drop-share upload ./my-project/ --server https://your-domain
```

On success it prints the artifact's immutable URL:

```
Uploading release.zip (4.2 MB)...

Upload complete.

Artifact:
https://your-domain/a/01K7X3ABCD9QWERTY123456789/
```

## Limits

The server enforces a maximum of 10 MB per file and 10 MB per artifact
(folder or extracted ZIP) — this CLI checks the same limits locally first,
purely to fail fast without a network round trip. The server-side check is
the one that actually matters and can't be bypassed by skipping the CLI.

## Behavior notes

- **Folders**: enumerated recursively; relative paths are preserved and
  sent as-is (never the local absolute filesystem path). Symlinks are
  skipped with a warning rather than followed.
- **Duplicate uploads**: uploading the same path twice always creates two
  distinct artifacts with two distinct URLs — nothing is ever overwritten.
- **No authentication**: this CLI talks to a drop-share server that has no
  auth by design (see the [main README](https://github.com/4msar/drop-share#security-model-read-this-before-deploying-publicly)).
  Anyone who can reach the server can upload; point `--server` at a server
  you control.
