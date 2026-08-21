#!/usr/bin/env node
import { basename, join, resolve } from "node:path";
import { readFileSync, readdirSync, statSync } from "node:fs";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_ARTIFACT_SIZE_BYTES = 10 * 1024 * 1024;
const DEFAULT_SERVER = "https://artifacts.msar.dev";

type UploadMode = "file" | "zip" | "zip-extract" | "directory";

interface Args {
  targetPath: string;
  server: string;
  extract: boolean;
  name?: string;
}

interface DirectoryEntry {
  relativePath: string;
  absolutePath: string;
  size: number;
}

interface UploadResult {
  id: string;
  url: string;
}

function printUsageAndExit(): never {
  console.error("Usage: drop-share upload <path> [--server <url>] [--extract] [--name <name>]");
  console.error("");
  console.error(`Environment: ARTIFACT_SERVER can be set instead of passing --server.`);
  console.error(`Defaults to ${DEFAULT_SERVER} if neither is given.`);
  process.exit(1);
}

function parseArgs(argv: string[]): Args {
  const [command, rawTargetPath, ...rest] = argv;
  if (command !== "upload" || !rawTargetPath) {
    printUsageAndExit();
  }

  let server = process.env.ARTIFACT_SERVER ?? DEFAULT_SERVER;
  let extract = false;
  let name: string | undefined;

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--server") {
      server = rest[++i] ?? server;
    } else if (arg === "--extract") {
      extract = true;
    } else if (arg === "--name") {
      name = rest[++i];
    } else {
      console.error(`Unknown option: ${arg}`);
      printUsageAndExit();
    }
  }

  return { targetPath: resolve(rawTargetPath), server: server.replace(/\/+$/, ""), extract, name };
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
    throw new Error(`Upload failed (HTTP ${response.status})`);
  }
  if (!response.ok || !body.success || !body.id || !body.url) {
    throw new Error(body.error ?? `Upload failed (HTTP ${response.status})`);
  }
  return { id: body.id, url: body.url };
}

async function uploadSingleFile(server: string, absolutePath: string, mode: UploadMode, displayName: string) {
  const form = new FormData();
  form.set("mode", mode);
  form.append("files", new Blob([readFileSync(absolutePath)]), displayName);
  return postUpload(server, form);
}

async function uploadDirectory(server: string, entries: DirectoryEntry[]) {
  const form = new FormData();
  form.set("mode", "directory");
  for (const entry of entries) {
    form.append("files", new Blob([readFileSync(entry.absolutePath)]), entry.relativePath);
  }
  return postUpload(server, form);
}

function printSuccess(server: string, result: UploadResult): void {
  console.log("");
  console.log("Upload complete.");
  console.log("");
  console.log("Artifact:");
  console.log(`${server}${result.url}`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

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
    const result = await uploadDirectory(args.server, entries);
    printSuccess(args.server, result);
    return;
  }

  const displayName = args.name ?? basename(args.targetPath);
  const isZip = displayName.toLowerCase().endsWith(".zip");
  const mode: UploadMode = isZip ? (args.extract ? "zip-extract" : "zip") : "file";
  validateFileSize(stats.size, displayName);

  const modeLabel = mode === "zip-extract" ? " (extract & browse)" : "";
  console.log(`Uploading ${displayName} (${formatBytes(stats.size)})${modeLabel} to ${args.server}...`);
  const result = await uploadSingleFile(args.server, args.targetPath, mode, displayName);
  printSuccess(args.server, result);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
