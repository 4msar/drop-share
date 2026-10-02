import { resolve } from "node:path";

export const DEFAULT_SERVER = "https://artifacts.msar.dev";

export interface Args {
    command: "upload" | "update";
    targetPaths: string[];
    server: string;
    extract: boolean;
    name?: string;
    forceNew: boolean;
    id?: string;
    token?: string;
    password?: string;
    /** `--private` / `--public`: change who can view the artifact. */
    visibility?: "public" | "private";
}

function printUsageAndExit(): never {
    console.error(
        "Usage: drop-share upload <path> [<path> ...] [--server <url>] [--extract] [--name <name>] [--token <token>] [--password <password>] [--private | --public] [--new]",
    );
    console.error(
        "       drop-share update <path> [<path> ...] [--server <url>] [--extract] [--id <id>] [--token <token>] [--password <password>] [--private | --public]",
    );
    console.error("");
    console.error(
        "Passing multiple paths bundles them into a single artifact (each must be a file, not a directory).",
    );
    console.error(
        "--password unlocks a protected artifact with its web-viewer password, or locks a newly created one; --token takes the derived token directly.",
    );
    console.error(
        "--private makes the artifact viewable only through its read-only share link (it must be locked: pass --password for a new one); --public reverts that.",
    );
    console.error(
        `Environment: ARTIFACT_SERVER can be set instead of passing --server.`,
    );
    console.error(`Defaults to ${DEFAULT_SERVER} if neither is given.`);
    process.exit(1);
}

export function parseArgs(argv: string[]): Args {
    const [command, ...rest] = argv;
    if (command !== "upload" && command !== "update") {
        printUsageAndExit();
    }

    let server = process.env.ARTIFACT_SERVER ?? DEFAULT_SERVER;
    let extract = false;
    let name: string | undefined;
    let forceNew = false;
    let id: string | undefined;
    let token: string | undefined;
    let password: string | undefined;
    let visibility: Args["visibility"];
    let visibilityFlags = 0;
    const targetPaths: string[] = [];

    for (let i = 0; i < rest.length; i++) {
        const arg = rest[i];
        if (arg === "--server") {
            server = rest[++i] ?? server;
        } else if (arg === "--extract") {
            extract = true;
        } else if (arg === "--name") {
            name = rest[++i];
        } else if (arg === "--new" && command === "upload") {
            forceNew = true;
        } else if (arg === "--id" && command === "update") {
            id = rest[++i];
        } else if (arg === "--token") {
            token = rest[++i];
        } else if (arg === "--password") {
            password = rest[++i];
        } else if (arg === "--private" || arg === "--public") {
            visibility = arg === "--private" ? "private" : "public";
            visibilityFlags++;
        } else if (arg.startsWith("--")) {
            console.error(`Unknown option: ${arg}`);
            printUsageAndExit();
        } else {
            targetPaths.push(resolve(arg));
        }
    }

    if (targetPaths.length === 0) {
        printUsageAndExit();
    }
    if (token !== undefined && password !== undefined) {
        console.error("--token and --password can't be used together.");
        printUsageAndExit();
    }
    if (visibilityFlags > 1) {
        console.error("--private and --public can't be used together.");
        printUsageAndExit();
    }
    if (name !== undefined && targetPaths.length > 1) {
        console.error("--name can't be used with multiple paths.");
        printUsageAndExit();
    }

    return {
        command,
        targetPaths,
        server: server.replace(/\/+$/, ""),
        extract,
        name,
        forceNew,
        id,
        token,
        password,
        visibility,
    };
}
