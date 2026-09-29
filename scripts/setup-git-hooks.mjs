// Run from the `prepare` script: points Git at the committed .githooks/
// directory. Never fails the install — outside a Git work tree, or without
// git on PATH (e.g. a CI tarball install), it just skips.
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync } from "node:fs";

function git(...args) {
    return execFileSync("git", args, { stdio: ["ignore", "pipe", "ignore"] })
        .toString()
        .trim();
}

let insideWorkTree = false;
try {
    insideWorkTree = git("rev-parse", "--is-inside-work-tree") === "true";
} catch {
    // git missing, or not a repository.
}

if (!insideWorkTree) {
    console.log("setup-git-hooks: not a Git work tree or git unavailable, skipping.");
} else {
    try {
        git("config", "core.hooksPath", ".githooks");
        // Guard against the executable bit being lost (e.g. a Windows checkout).
        if (existsSync(".githooks/pre-commit")) {
            chmodSync(".githooks/pre-commit", 0o755);
        }
    } catch (err) {
        console.warn(`setup-git-hooks: could not configure hooks: ${err.message}`);
    }
}
