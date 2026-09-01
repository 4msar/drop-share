import {
    useCallback,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";
import {
    type ArtifactListing,
    ArtifactNotFoundError,
    fetchArtifactListing,
} from "../lib/artifact";
import { getStoredToken, saveToken } from "../lib/tokens";
import { useRecentItemsActions } from "./useRecentItems";
import {
    ArtifactActionsContext,
    ArtifactStateContext,
    type ArtifactActions,
    type ArtifactState,
} from "./artifact-context";

interface ArtifactProviderProps {
    id: string;
    /** The route's raw sub-path. What's actually rendered comes from the
     * listing response's own `path` (see the effect below) so a folder
     * navigation can never pair a new path with the previous folder's files. */
    routePath: string;
    token: string | null;
    /** Called with a freshly derived lock/unlock token; the caller owns
     * where that token is persisted (this app keeps it in the URL). */
    onTokenChange: (token: string) => void;
    children: ReactNode;
}

/**
 * Owns the artifact listing fetch and every piece of state derived from it,
 * and exposes it to the whole viewer subtree - Header, the actions menu, the
 * lock/unlock dialogs, the file list, and the preview pane - without
 * threading it through as props at every level.
 */
export function ArtifactProvider({
    id,
    routePath,
    token,
    onTokenChange,
    children,
}: ArtifactProviderProps) {
    const { addItem } = useRecentItemsActions();
    const [listing, setListing] = useState<ArtifactListing | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [deleted, setDeleted] = useState(false);
    const [reloadToken, setReloadToken] = useState(0);

    useEffect(() => {
        // `cancelled` matters because navigating between folders quickly can
        // leave an earlier request in flight; without it a slow response for
        // the folder you just left can overwrite the one you're now looking at.
        let cancelled = false;

        fetchArtifactListing(id, routePath, token).then(
            (next) => {
                if (cancelled) return;
                setListing(next);
                setLoadError(null);
                addItem(id, undefined, next.label);
                // A URL can carry a valid token without this browser ever
                // having locked the artifact itself (e.g. a shared link) -
                // persist it so the Recent Switcher keeps modify access.
                if (token && next.canModify && getStoredToken(id) !== token) {
                    saveToken(id, token);
                }
            },
            (error: unknown) => {
                if (cancelled) return;
                setListing(null);
                setLoadError(
                    error instanceof ArtifactNotFoundError ||
                        error instanceof Error
                        ? error.message
                        : "Could not load this artifact.",
                );
            },
        );

        return () => {
            cancelled = true;
        };
    }, [id, routePath, token, reloadToken, addItem]);

    const reload = useCallback(
        () => setReloadToken((count) => count + 1),
        [],
    );
    const reportError = useCallback(
        (message: string | null) => setActionError(message),
        [],
    );
    const tokenObtained = useCallback(
        (newToken: string) => onTokenChange(newToken),
        [onTokenChange],
    );
    const markDeleted = useCallback(() => setDeleted(true), []);

    const subPath = listing?.path ?? routePath;

    const state = useMemo<ArtifactState>(
        () => ({
            id,
            subPath,
            isRoot: subPath === "",
            token,
            label: listing?.label,
            locked: listing?.locked ?? false,
            canModify: listing?.canModify ?? false,
            listing,
            loadError,
            actionError,
            deleted,
        }),
        [id, subPath, token, listing, loadError, actionError, deleted],
    );

    const actions = useMemo<ArtifactActions>(
        () => ({ reload, reportError, tokenObtained, markDeleted }),
        [reload, reportError, tokenObtained, markDeleted],
    );

    return (
        <ArtifactStateContext value={state}>
            <ArtifactActionsContext value={actions}>
                {children}
            </ArtifactActionsContext>
        </ArtifactStateContext>
    );
}
