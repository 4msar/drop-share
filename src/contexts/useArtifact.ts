import { use } from "react";
import {
    ArtifactActionsContext,
    ArtifactStateContext,
    type ArtifactActions,
    type ArtifactState,
} from "./artifact-context";

/** The current artifact's data. Only valid once `listing` is non-null. */
export function useArtifactState(): ArtifactState {
    const value = use(ArtifactStateContext);
    if (value === null) {
        throw new Error("useArtifactState must be used within an ArtifactProvider");
    }
    return value;
}

/** Actions that mutate the current artifact's page-level state. */
export function useArtifactActions(): ArtifactActions {
    const value = use(ArtifactActionsContext);
    if (value === null) {
        throw new Error(
            "useArtifactActions must be used within an ArtifactProvider",
        );
    }
    return value;
}
