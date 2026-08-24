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
}

function printUsageAndExit(): never {
  console.error("Usage: drop-share upload <path> [<path> ...] [--server <url>] [--extract] [--name <name>] [--new]");
  console.error("       drop-share update <path> [<path> ...] [--server <url>] [--extract] [--id <id>]");
  console.error("");
  console.error("Passing multiple paths bundles them into a single artifact (each must be a file, not a directory).");
  console.error(`Environment: ARTIFACT_SERVER can be set instead of passing --server.`);
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
  };
}
