import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router";
import { FileList } from "../components/FileList";
import { Header } from "../components/Header";
import { PreviewPane } from "../components/PreviewPane";
import {
    type ArtifactFile,
    type FileSortMode,
    parseShareSegment,
    pickDefaultPreview,
    sortFiles,
} from "../lib/artifact";
import { CheckIcon } from "../components/Icons";
import { UnavailableScreen } from "../components/UnavailableScreen";
import {
    defaultSidebarOpen,
    getSavedSidebarOpen,
    saveSidebarOpen,
} from "../lib/sidebar";
import { ProgressBarWithTimeout } from "../components/ProgressBar";
import { ErrorToast } from "../components/ErrorToast";
import { ArtifactProvider } from "../contexts/ArtifactProvider";
import { useArtifactActions, useArtifactState } from "../contexts/useArtifact";

interface ViewerPageProps {
    /** Mounted on the read-only `/s/<id>[.<shareToken>]/` share route. */
    shared?: boolean;
}

export default function ViewerPage({ shared = false }: ViewerPageProps) {
    const params = useParams();
    const [searchParams, setSearchParams] = useSearchParams();
    const { id, shareToken } = shared
        ? parseShareSegment(params.seg ?? "")
        : { id: params.id ?? "", shareToken: null };
    // The route's path is what we fetch; what we *render* comes from the
    // listing itself (ArtifactProvider's `subPath`), so a folder navigation
    // can never pair the new path with the previous folder's file names.
    const routePath = params["*"] ?? "";
    // A share link is read-only: an owner token in its query is ignored.
    const token = shared ? null : searchParams.get("token");

    // Locking and unlocking both end with this browser holding a fresh,
    // valid token, so it's folded into the URL immediately - ArtifactProvider's
    // fetch effect then refetches the listing with it and canModify flips
    // to true.
    const onTokenChange = (newToken: string) => {
        setSearchParams(
            (current) => {
                const next = new URLSearchParams(current);
                next.set("token", newToken);
                return next;
            },
            { replace: true },
        );
    };

    return (
        <ArtifactProvider
            id={id}
            routePath={routePath}
            token={token}
            shareToken={shareToken}
            readOnly={shared}
            onTokenChange={onTokenChange}
        >
            <ViewerPageContent />
        </ArtifactProvider>
    );
}

function ViewerPageContent() {
    const [searchParams, setSearchParams] = useSearchParams();
    const { id, listing, loadError, actionError, deleted } = useArtifactState();
    const { reportError } = useArtifactActions();
    // An explicit toggle is remembered across visits; until there is one,
    // the default follows the layout (open beside the preview, closed when
    // stacked on narrow screens).
    const [fileListOpen, setFileListOpen] = useState(
        () => getSavedSidebarOpen() ?? defaultSidebarOpen(window.innerWidth),
    );
    const toggleFileList = () => {
        const next = !fileListOpen;
        saveSidebarOpen(next);
        setFileListOpen(next);
    };
    const [sortMode, setSortMode] = useState<FileSortMode>("newest");
    const selectedFromQuery = searchParams.get("file");

    const setFileQueryParam = (name: string | null, replace = true) => {
        setSearchParams(
            (current) => {
                const next = new URLSearchParams(current);
                if (name === null) {
                    next.delete("file");
                } else {
                    next.set("file", name);
                }
                return next;
            },
            { replace },
        );
    };

    useEffect(() => {
        const artifactName = listing?.label || id;
        document.title = `${artifactName} · Drop Share`;
    }, [listing?.label, id]);

    useEffect(() => {
        // Only crossing the breakpoint re-applies the layout default (and
        // only when nothing was saved) - an ordinary resize never overrides
        // the viewer's own choice.
        let wide = defaultSidebarOpen(window.innerWidth);
        const handleResize = () => {
            const nextWide = defaultSidebarOpen(window.innerWidth);
            if (nextWide === wide) return;
            wide = nextWide;
            if (getSavedSidebarOpen() === null) setFileListOpen(nextWide);
        };

        window.addEventListener("resize", handleResize);
        return () => {
            window.removeEventListener("resize", handleResize);
        };
    }, []);

    if (deleted) {
        return (
            <main
                role="status"
                className="grid min-h-dvh place-items-center p-6"
            >
                <section className="w-full max-w-md rounded-3xl border border-edge p-8 text-center shadow-lg gap-y-5 flex flex-col">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10 text-green-500">
                        <CheckIcon />
                    </div>
                    <h1 className="mb-2 text-2xl font-medium text-heading">
                        Artifact deleted
                    </h1>
                    <p className="text-body">
                        The artifact was permanently deleted. You'll be
                        redirected home shortly.
                    </p>

                    <ProgressBarWithTimeout
                        timeout={3000}
                        direction="backward"
                    />
                </section>
            </main>
        );
    }

    if (loadError !== null) {
        return (
            <UnavailableScreen
                title="Artifact unavailable"
                message={loadError}
            />
        );
    }

    if (listing === null) {
        return (
            <main className="grid min-h-dvh place-items-center p-6">
                <p className="text-body">Loading…</p>
            </main>
        );
    }

    const files = sortFiles(listing.files, sortMode);
    const selectedFromFiles =
        selectedFromQuery !== null
            ? files.find(
                  (file) => file.name === selectedFromQuery && file.previewable,
              )
            : undefined;
    const selected: ArtifactFile | null =
        selectedFromFiles ?? pickDefaultPreview(files);
    const directories = listing.directories.slice().sort();

    return (
        <div className="flex h-dvh flex-col">
            <Header />

            <div
                className={`grid min-h-0 flex-1 transition-[grid-template-columns,grid-template-rows] duration-200 ease-out max-md:grid-rows-[auto_1fr] ${
                    fileListOpen
                        ? "md:grid-cols-[280px_1fr]"
                        : "md:grid-cols-[36px_1fr]"
                }`}
            >
                <FileList
                    files={files}
                    directories={directories}
                    activeName={selected?.name ?? null}
                    sortMode={sortMode}
                    onSortModeChange={setSortMode}
                    onPreview={(file) => setFileQueryParam(file.name, false)}
                    open={fileListOpen}
                />
                <PreviewPane
                    files={files}
                    selected={selected}
                    sidebarOpen={fileListOpen}
                    onToggle={toggleFileList}
                />
            </div>

            {actionError !== null && (
                <ErrorToast
                    message={actionError}
                    onClose={() => reportError(null)}
                />
            )}
        </div>
    );
}
