import { createContext } from "react";
import type { ArtifactListing } from "../lib/artifact";

export interface ArtifactState {
    id: string;
    /** The listing's own path, not the raw route path - see ArtifactProvider's fetch effect. */
    subPath: string;
    isRoot: boolean;
    token: string | null;
    label?: string;
    locked: boolean;
    canModify: boolean;
    listing: ArtifactListing | null;
    loadError: string | null;
    actionError: string | null;
    deleted: boolean;
}

export interface ArtifactActions {
    /** Re-fetches the current listing (e.g. after an upload or rename). */
    reload: () => void;
    /** Reports (or clears, with `null`) a transient action error for the toast. */
    reportError: (message: string | null) => void;
    /** Folds a freshly obtained lock/unlock token into the page. */
    tokenObtained: (token: string) => void;
    /** Marks the artifact as deleted, swapping in the "deleted" screen. */
    markDeleted: () => void;
}

export const ArtifactStateContext = createContext<ArtifactState | null>(null);
export const ArtifactActionsContext = createContext<ArtifactActions | null>(
    null,
);
