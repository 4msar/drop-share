import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative } from "node:path";

export interface StateEntry {
    id: string;
    url: string;
    updatedAt: string;
}

type State = Record<string, StateEntry>;

export function defaultStatePath(): string {
    return join(homedir(), ".drop-share", "state.json");
}

function stateKey(server: string, baseDirectory: string): string {
    const displayDirectory =
        relative(process.cwd(), baseDirectory) || basename(baseDirectory);
    return `${server}|${displayDirectory}`;
}

export function baseDirectory(
    targetPaths: string[],
    directoryTargets: Set<string> = new Set(),
): string {
    const directories = targetPaths.map((targetPath) =>
        directoryTargets.has(targetPath) ? targetPath : dirname(targetPath),
    );
    return directories.slice(1).reduce(commonDirectory, directories[0]);
}

function commonDirectory(
    firstDirectory: string,
    secondDirectory: string,
): string {
    let directory = firstDirectory;
    while (
        secondDirectory !== directory &&
        (isAbsolute(relative(directory, secondDirectory)) ||
            relative(directory, secondDirectory).startsWith(".."))
    ) {
        const parent = dirname(directory);
        if (parent === directory) return process.cwd();
        directory = parent;
    }
    return directory;
}

export function loadState(statePath: string): State {
    if (!existsSync(statePath)) return {};
    try {
        const parsed: unknown = JSON.parse(readFileSync(statePath, "utf-8"));
        return typeof parsed === "object" && parsed !== null
            ? (parsed as State)
            : {};
    } catch {
        return {};
    }
}

export function saveState(statePath: string, state: State): void {
    mkdirSync(dirname(statePath), { recursive: true });
    writeFileSync(statePath, JSON.stringify(state, null, 2));
}

export function getEntry(
    statePath: string,
    server: string,
    baseDirectoryPath: string,
): StateEntry | undefined {
    const state = loadState(statePath);
    const key = stateKey(server, baseDirectoryPath);
    const directEntry = state[key];
    if (directEntry) return directEntry;

    const directoryPrefix = `${key}/`;
    return Object.entries(state)
        .filter(([entryKey]) => entryKey.startsWith(directoryPrefix))
        .map(([, entry]) => entry)
        .sort((first, second) =>
            second.updatedAt.localeCompare(first.updatedAt),
        )[0];
}

export function setEntry(
    statePath: string,
    server: string,
    baseDirectoryPath: string,
    entry: StateEntry,
): void {
    const state = loadState(statePath);
    state[stateKey(server, baseDirectoryPath)] = entry;
    saveState(statePath, state);
}

export function removeEntry(
    statePath: string,
    server: string,
    baseDirectoryPath: string,
): void {
    const state = loadState(statePath);
    const key = stateKey(server, baseDirectoryPath);
    delete state[key];
    for (const entryKey of Object.keys(state)) {
        if (entryKey.startsWith(`${key}/`)) delete state[entryKey];
    }
    saveState(statePath, state);
}
