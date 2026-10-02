#!/usr/bin/env node
import { basename, join } from "node:path";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { type Args, parseArgs } from "./args.js";
import { disambiguateNames } from "./names.js";
import { NoSavedArtifactError, type UploadPlan, planUpload } from "./plan.js";
import {
    baseDirectory,
    defaultStatePath,
    getEntry,
    removeEntry,
    setEntry,
} from "./state.js";
import { derivePasswordToken, resolveToken, sharePath } from "./token.js";

type Visibility = "public" | "private";

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
            const relativePath = relativePrefix
                ? `${relativePrefix}/${dirent.name}`
                : dirent.name;

            if (dirent.isSymbolicLink()) {
                console.error(`Skipping symlink: ${relativePath}`);
                continue;
            }
            if (dirent.isDirectory()) {
                walk(absolutePath, relativePath);
            } else if (dirent.isFile()) {
                entries.push({
                    relativePath,
                    absolutePath,
                    size: statSync(absolutePath).size,
                });
            }
        }
    }

    walk(root, "");
    return entries;
}

function validateFileSize(size: number, label: string): void {
    if (size > MAX_FILE_SIZE_BYTES) {
        throw new Error(
            `"${label}" is ${formatBytes(size)}, exceeding the 10 MB maximum file size`,
        );
    }
}

/** Validates and prepares a set of loose files (not a directory) for a single bundled upload. */
function buildMultiFileEntries(targetPaths: string[]): DirectoryEntry[] {
    const sizes = targetPaths.map((path) => {
        const stats = statSync(path, { throwIfNoEntry: false });
        if (!stats) {
            console.error(`No such file: ${path}`);
            process.exit(1);
        }
        if (stats.isDirectory()) {
            console.error(
                `"${path}" is a directory. Pass a single directory path, or a list of individual files.`,
            );
            process.exit(1);
        }
        return stats.size;
    });

    const relativePaths = disambiguateNames(targetPaths);
    return targetPaths.map((absolutePath, i) => ({
        relativePath: relativePaths[i],
        absolutePath,
        size: sizes[i],
    }));
}

function validateDirectorySizes(entries: DirectoryEntry[]): number {
    let total = 0;
    for (const entry of entries) {
        validateFileSize(entry.size, entry.relativePath);
        total += entry.size;
    }
    if (total > MAX_ARTIFACT_SIZE_BYTES) {
        throw new Error(
            `Total size is ${formatBytes(total)}, exceeding the 10 MB maximum artifact size`,
        );
    }
    return total;
}

async function postUpload(
    server: string,
    form: FormData,
    token: string | undefined,
): Promise<UploadResult> {
    const response = await fetch(`${server}/api/upload`, {
        method: "POST",
        body: form,
        headers: token ? { "X-Artifact-Token": token } : undefined,
    });
    let body: { success?: boolean; id?: string; url?: string; error?: string };
    try {
        body = (await response.json()) as typeof body;
    } catch {
        throw new UploadHttpError(
            response.status,
            `Upload failed (HTTP ${response.status})`,
        );
    }
    if (!response.ok || !body.success || !body.id || !body.url) {
        throw new UploadHttpError(
            response.status,
            body.error ?? `Upload failed (HTTP ${response.status})`,
        );
    }
    return { id: body.id, url: body.url };
}

async function uploadSingleFile(
    server: string,
    absolutePath: string,
    mode: UploadMode,
    displayName: string,
    artifactId: string | undefined,
    token: string | undefined,
): Promise<UploadResult> {
    const form = new FormData();
    form.set("mode", mode);
    if (artifactId) form.set("id", artifactId);
    form.append("files", new Blob([readFileSync(absolutePath)]), displayName);
    return postUpload(server, form, token);
}

async function uploadDirectory(
    server: string,
    entries: DirectoryEntry[],
    artifactId: string | undefined,
    token: string | undefined,
): Promise<UploadResult> {
    const form = new FormData();
    form.set("mode", "directory");
    if (artifactId) form.set("id", artifactId);
    for (const entry of entries) {
        form.append(
            "files",
            new Blob([readFileSync(entry.absolutePath)]),
            entry.relativePath,
        );
    }
    return postUpload(server, form, token);
}

/**
 * Locks a just-created artifact the same way the web viewer does: `PATCH`
 * with the derived token - and, with `visibility`, sets that in the same
 * request so it can never end up locked but still public.
 */
async function lockArtifact(
    server: string,
    id: string,
    token: string,
    visibility?: Visibility,
): Promise<void> {
    const response = await fetch(`${server}/api/artifact/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lock: true, token, visibility }),
    });
    let body: { success?: boolean; locked?: boolean; error?: string };
    try {
        body = (await response.json()) as typeof body;
    } catch {
        body = {};
    }
    if (!response.ok || !body.success || !body.locked) {
        throw new Error(body.error ?? `Lock failed (HTTP ${response.status})`);
    }
}

/** Changes an existing (locked) artifact's visibility; needs its token. */
async function setVisibility(
    server: string,
    id: string,
    token: string,
    visibility: Visibility,
): Promise<void> {
    const response = await fetch(`${server}/api/artifact/${id}`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
            "X-Artifact-Token": token,
        },
        body: JSON.stringify({ visibility }),
    });
    let body: { success?: boolean; error?: string };
    try {
        body = (await response.json()) as typeof body;
    } catch {
        body = {};
    }
    if (!response.ok || !body.success) {
        throw new Error(
            body.error ?? `Changing visibility failed (HTTP ${response.status})`,
        );
    }
}

/** Best-effort read of an artifact's current visibility, for printing the right share link. */
async function fetchVisibility(
    server: string,
    id: string,
    token: string | undefined,
): Promise<Visibility> {
    try {
        const query = token ? `?token=${encodeURIComponent(token)}` : "";
        const response = await fetch(`${server}/api/artifact/${id}${query}`);
        const body = (await response.json()) as { visibility?: string };
        return body.visibility === "private" ? "private" : "public";
    } catch {
        return "public";
    }
}

function printResult(
    server: string,
    result: UploadResult,
    label: string,
    share?: { visibility: Visibility; token: string | undefined },
): void {
    console.log("");
    console.log("Upload complete.");
    console.log("");
    console.log(label);
    console.log(`${server}${result.url}`);
    if (share) {
        console.log("");
        console.log(
            share.visibility === "private"
                ? "Private - read-only share link:"
                : "Read-only share link:",
        );
        console.log(`${server}${sharePath(result.id, share.visibility, share.token)}`);
    }
}

async function performUpload(
    args: Args,
    artifactId: string | undefined,
    token: string | undefined,
): Promise<UploadResult> {
    if (args.targetPaths.length > 1) {
        const entries = buildMultiFileEntries(args.targetPaths);
        const totalSize = validateDirectorySizes(entries);
        console.log(
            `Uploading ${entries.length} files (${formatBytes(totalSize)}) to ${args.server}...`,
        );
        return uploadDirectory(args.server, entries, artifactId, token);
    }

    const targetPath = args.targetPaths[0];
    const stats = statSync(targetPath, { throwIfNoEntry: false });
    if (!stats) {
        console.error(`No such file or directory: ${targetPath}`);
        process.exit(1);
    }

    if (stats.isDirectory()) {
        const entries = enumerateDirectory(targetPath);
        if (entries.length === 0) {
            console.error("Directory contains no files to upload.");
            process.exit(1);
        }
        const totalSize = validateDirectorySizes(entries);
        console.log(
            `Uploading ${basename(targetPath)}/ (${entries.length} files, ${formatBytes(totalSize)}) to ${args.server}...`,
        );
        return uploadDirectory(args.server, entries, artifactId, token);
    }

    const displayName = args.name ?? basename(targetPath);
    const isZip = displayName.toLowerCase().endsWith(".zip");
    const mode: UploadMode = isZip
        ? args.extract
            ? "zip-extract"
            : "zip"
        : "file";
    validateFileSize(stats.size, displayName);

    const modeLabel = mode === "zip-extract" ? " (extract & browse)" : "";
    console.log(
        `Uploading ${displayName} (${formatBytes(stats.size)})${modeLabel} to ${args.server}...`,
    );
    return uploadSingleFile(
        args.server,
        targetPath,
        mode,
        displayName,
        artifactId,
        token,
    );
}

/** Resolves the upload/update decision up front, exiting cleanly (no network call) if `update` has nothing to target. */
function resolvePlan(
    args: Args,
    existing: ReturnType<typeof getEntry>,
): UploadPlan {
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

/** Deterministic state-file key for a set of target paths, independent of the order they were given in. */
function stateDirectory(targetPaths: string[]): string {
    const directoryTargets = new Set<string>();
    for (const targetPath of targetPaths) {
        if (statSync(targetPath, { throwIfNoEntry: false })?.isDirectory()) {
            directoryTargets.add(targetPath);
        }
    }
    return baseDirectory(targetPaths, directoryTargets);
}

function saveResult(
    statePath: string,
    args: Args,
    result: UploadResult,
    token: string | undefined,
): void {
    setEntry(statePath, args.server, stateDirectory(args.targetPaths), {
        id: result.id,
        url: result.url,
        updatedAt: new Date().toISOString(),
        ...(token ? { token } : {}),
    });
}

async function main(): Promise<void> {
    const args = parseArgs(process.argv.slice(2));
    const statePath = defaultStatePath();
    const existing = getEntry(
        statePath,
        args.server,
        stateDirectory(args.targetPaths),
    );
    const plan = resolvePlan(args, existing);

    const attemptId = plan.action === "update" ? plan.id : undefined;
    const token = resolveToken(args, plan, existing);

    // Checked before uploading anything: a private artifact must be locked,
    // and a new one only gets locked when --password is given.
    if (args.visibility === "private" && plan.action === "create" && args.password === undefined) {
        console.error("--private needs --password for a new artifact (it must be locked).");
        process.exit(1);
    }
    if (args.visibility !== undefined && plan.action === "update" && token === undefined) {
        console.error(`--${args.visibility} needs the artifact's --password or --token.`);
        process.exit(1);
    }

    try {
        const result = await performUpload(args, attemptId, token);
        if (plan.action === "create") {
            await finishFreshUpload(statePath, args, result, token);
            return;
        }
        saveResult(statePath, args, result, token);
        if (args.visibility !== undefined && token !== undefined) {
            await setVisibility(args.server, result.id, token, args.visibility);
        }
        printResult(args.server, result, "Updated artifact:", {
            visibility:
                args.visibility ??
                (await fetchVisibility(args.server, result.id, token)),
            token,
        });
        return;
    } catch (error) {
        // Re-throw anything that isn't "the artifact this update targeted is
        // gone" - including this guard clause narrows `plan` to the "update"
        // variant for the rest of this function, so `plan.id` below is safe.
        if (
            !(error instanceof UploadHttpError) ||
            error.status !== 404 ||
            plan.action !== "update"
        ) {
            throw error;
        }

        if (existing?.id === plan.id) {
            removeEntry(
                statePath,
                args.server,
                stateDirectory(args.targetPaths),
            );
        }
        if (args.command === "update") {
            console.error(
                `Artifact ${plan.id} no longer exists on ${args.server}.`,
            );
            console.error(
                `Run "drop-share upload ${args.targetPaths.join(" ")}" to publish a new one.`,
            );
            process.exit(1);
        }
    }

    // Plain `upload` auto-detected a now-stale artifact - fall back to
    // publishing a fresh one instead of failing outright.
    const result = await performUpload(args, undefined, args.token);
    await finishFreshUpload(statePath, args, result, args.token);
}

/**
 * Saves and reports a newly created artifact, locking it first when
 * `--password` was given. New artifacts are always created unlocked, so the
 * lock is a separate request made once the id (the password's salt) exists.
 */
async function finishFreshUpload(
    statePath: string,
    args: Args,
    result: UploadResult,
    token: string | undefined,
): Promise<void> {
    if (args.password === undefined) {
        saveResult(statePath, args, result, token);
        printResult(args.server, result, "Artifact:", {
            visibility: "public",
            token,
        });
        return;
    }

    const lockToken = derivePasswordToken(result.id, args.password);
    const visibility = args.visibility ?? "public";
    try {
        await lockArtifact(args.server, result.id, lockToken, args.visibility);
    } catch (error) {
        // The upload itself succeeded - remember it so a retry updates this
        // artifact rather than creating yet another unlocked one.
        saveResult(statePath, args, result, undefined);
        printResult(args.server, result, "Artifact (NOT locked):");
        console.error("");
        console.error(
            `Uploaded, but locking failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        console.error("Lock it from the web viewer instead.");
        process.exit(1);
    }
    saveResult(statePath, args, result, lockToken);
    printResult(
        args.server,
        result,
        visibility === "private"
            ? "Artifact (locked, private):"
            : "Artifact (locked):",
        { visibility, token: lockToken },
    );
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
