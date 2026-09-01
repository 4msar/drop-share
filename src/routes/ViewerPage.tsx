import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { Button } from "../components/Button";
import { FileList } from "../components/FileList";
import { Header } from "../components/Header";
import { PreviewPane } from "../components/PreviewPane";
import {
    type ArtifactFile,
    type FileSortMode,
    pickDefaultPreview,
    sortFiles,
} from "../lib/artifact";
import { ArchiveIcon, CheckIcon } from "../components/Icons";
import { ProgressBarWithTimeout } from "../components/ProgressBar";
import { ErrorToast } from "../components/ErrorToast";
import { ArtifactProvider } from "../contexts/ArtifactProvider";
import { useArtifactActions, useArtifactState } from "../contexts/useArtifact";

export default function ViewerPage() {
    const params = useParams();
    const [searchParams, setSearchParams] = useSearchParams();
    const id = params.id ?? "";
    // The route's path is what we fetch; what we *render* comes from the
    // listing itself (ArtifactProvider's `subPath`), so a folder navigation
    // can never pair the new path with the previous folder's file names.
    const routePath = params["*"] ?? "";
    const token = searchParams.get("token");

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
            onTokenChange={onTokenChange}
        >
            <ViewerPageContent />
        </ArtifactProvider>
    );
}

function ViewerPageContent() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { id, listing, loadError, actionError, deleted } = useArtifactState();
    const { reportError } = useArtifactActions();
    const [fileListOpen, setFileListOpen] = useState(true);
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
        const handleResize = () => {
            if (window.innerWidth < 768) {
                setFileListOpen(false);
            } else {
                setFileListOpen(true);
            }
        };

        window.addEventListener("resize", handleResize);

        // Call the handler immediately to set the initial state
        handleResize();

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
            <main className="grid min-h-dvh place-items-center p-6">
                <section
                    role="alert"
                    className="max-w-md text-center flex flex-col gap-y-4"
                >
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-500">
                        <ArchiveIcon />
                    </div>

                    <h1 className="text-2xl font-medium text-heading">
                        Artifact unavailable
                    </h1>
                    <p className="text-body">{loadError}</p>
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={() => void navigate("/")}
                    >
                        Go home
                    </Button>
                </section>
            </main>
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
                    onToggle={() => setFileListOpen((open) => !open)}
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
