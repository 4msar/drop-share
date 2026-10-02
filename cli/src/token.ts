import { createHash } from "node:crypto";
import type { Args } from "./args.js";
import type { UploadPlan } from "./plan.js";
import type { StateEntry } from "./state.js";

/**
 * Derives an artifact's lock token from its password exactly the way the web
 * viewer does (`hashPassword` in the app's `src/lib/hash.ts`):
 * SHA-1("<artifactId>:<password>") as lowercase hex. The server only ever
 * stores and compares this derived token, never the password itself.
 */
export function derivePasswordToken(artifactId: string, password: string): string {
    return createHash("sha1").update(`${artifactId}:${password}`).digest("hex");
}

/**
 * Picks the token to send for this upload: an explicit `--token` wins, then a
 * `--password` derived against the artifact being updated, then the token
 * saved from an earlier run. A password can't be derived for a fresh upload -
 * there's no artifact id yet; the CLI locks the new artifact once it has one.
 */
export function resolveToken(
    args: Args,
    plan: UploadPlan,
    existing: StateEntry | undefined,
): string | undefined {
    if (args.token !== undefined) return args.token;
    if (args.password !== undefined && plan.action === "update") {
        return derivePasswordToken(plan.id, args.password);
    }
    return existing?.token;
}
