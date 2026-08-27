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
): Promise<UploadResult> {
    const response = await fetch(`${server}/api/upload`, {
        method: "POST",
        body: form,
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
): Promise<UploadResult> {
    const form = new FormData();
    form.set("mode", mode);
    if (artifactId) form.set("id", artifactId);
    form.append("files", new Blob([readFileSync(absolutePath)]), displayName);
    return postUpload(server, form);
}

async function uploadDirectory(
    server: string,
    entries: DirectoryEntry[],
    artifactId: string | undefined,
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
    return postUpload(server, form);
}

function printResult(
    server: string,
    result: UploadResult,
    label: string,
): void {
    console.log("");
    console.log("Upload complete.");
    console.log("");
    console.log(label);
    console.log(`${server}${result.url}`);
}

async function performUpload(
    args: Args,
    artifactId: string | undefined,
): Promise<UploadResult> {
    if (args.targetPaths.length > 1) {
        const entries = buildMultiFileEntries(args.targetPaths);
        const totalSize = validateDirectorySizes(entries);
        console.log(
            `Uploading ${entries.length} files (${formatBytes(totalSize)}) to ${args.server}...`,
        );
        return uploadDirectory(args.server, entries, artifactId);
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
        return uploadDirectory(args.server, entries, artifactId);
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

function saveResult(statePath: string, args: Args, result: UploadResult): void {
    setEntry(statePath, args.server, stateDirectory(args.targetPaths), {
        id: result.id,
        url: result.url,
        updatedAt: new Date().toISOString(),
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

    try {
        const result = await performUpload(args, attemptId);
        saveResult(statePath, args, result);
        printResult(
            args.server,
            result,
            plan.action === "update" ? "Updated artifact:" : "Artifact:",
        );
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
    const result = await performUpload(args, undefined);
    saveResult(statePath, args, result);
    printResult(args.server, result, "Artifact:");
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
