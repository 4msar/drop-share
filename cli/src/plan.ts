import type { Args } from "./args.js";
import type { StateEntry } from "./state.js";

export class NoSavedArtifactError extends Error {}

export type UploadPlan = { action: "create" } | { action: "update"; id: string };

export function planUpload(args: Args, existing: StateEntry | undefined): UploadPlan {
  if (args.command === "update") {
    const id = args.id ?? existing?.id;
    if (!id) {
      const pathList = args.targetPaths.join(" ");
      throw new NoSavedArtifactError(
        `No saved artifact found for ${pathList} on ${args.server}. Run "drop-share upload ${pathList}" first.`,
      );
    }
    return { action: "update", id };
  }

  if (!args.forceNew && existing?.id) {
    return { action: "update", id: existing.id };
  }

  return { action: "create" };
}
