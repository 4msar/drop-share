import { createContext } from "react";
import type { ArtifactListing, ArtifactVisibility } from "../lib/artifact";

export interface ArtifactState {
    id: string;
    /** The listing's own path, not the raw route path - see ArtifactProvider's fetch effect. */
    subPath: string;
    isRoot: boolean;
    token: string | null;
    label?: string;
    locked: boolean;
    canModify: boolean;
    /** Opened through a `/s/` share link: view and download only. */
    readOnly: boolean;
    visibility: ArtifactVisibility;
    /** The artifact's share token, when known - from a `/s/` link, or
     * derived from the owner's token. */
    shareToken: string | null;
    /** URL prefix for in-app (viewer) navigation, e.g. `/a/<id>/`. */
    viewerBasePath: string;
    /** URL prefix for raw file bytes - a `/s/` share prefix for a private
     * artifact, since a raw file request can't carry the owner's token. */
    fileBasePath: string;
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
