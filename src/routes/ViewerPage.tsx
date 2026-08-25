import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { Button } from "../components/Button";
import { FileList } from "../components/FileList";
import { Header } from "../components/Header";
import { PreviewPane } from "../components/PreviewPane";
import {
    type ArtifactFile,
    type ArtifactListing,
    ArtifactNotFoundError,
    fetchArtifactListing,
    pickDefaultPreview,
    sortFiles,
} from "../lib/artifact";
import { pluralize } from "../lib/format";
import { addRecentItem, type RecentItem, getRecentItems } from "../lib/recent";

export default function ViewerPage() {
    const params = useParams();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const id = params.id ?? "";
    // The route's path is what we fetch; what we *render* comes from the
    // listing itself (see `subPath` below), so a folder navigation can never
    // pair the new path with the previous folder's file names.
    const routePath = params["*"] ?? "";

    const [listing, setListing] = useState<ArtifactListing | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [deleted, setDeleted] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const [reloadToken, setReloadToken] = useState(0);
    const [fileListOpen, setFileListOpen] = useState(true);
    const [recentItems, setRecentItems] = useState<RecentItem[]>(() =>
        getRecentItems(),
    );
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
        // `cancelled` matters because navigating between folders quickly can leave
        // an earlier request in flight; without it a slow response for the folder
        // you just left can overwrite the one you are now looking at.
        let cancelled = false;

        fetchArtifactListing(id, routePath).then(
            (next) => {
                if (cancelled) return;
                setListing(next);
                setLoadError(null);
                setRecentItems(addRecentItem(id));
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
    }, [id, routePath, reloadToken]);

    useEffect(() => {
        document.title =
            routePath === ""
                ? `${id} · Drop Share`
                : `${id}/${routePath} · Drop Share`;
    }, [id, routePath]);

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
                <section className="w-full max-w-md rounded-3xl border border-edge p-8 text-center shadow-lg">
                    <h1 className="mb-2 text-2xl font-medium text-heading">
                        Artifact deleted
                    </h1>
                    <p className="text-body">
                        The artifact was permanently deleted. You'll be
                        redirected home shortly.
                    </p>
                </section>
            </main>
        );
    }

    if (loadError !== null) {
        return (
            <main className="grid min-h-dvh place-items-center p-6">
                <section role="alert" className="max-w-md text-center">
                    <h1 className="mb-2 text-2xl font-medium text-heading">
                        Artifact unavailable
                    </h1>
                    <p className="mb-6 text-body">{loadError}</p>
                    <Button
                        variant="primary"
                        size="lg"
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

    const files = sortFiles(listing.files);
    const selectedFromFiles =
        selectedFromQuery !== null
            ? files.find(
                  (file) => file.name === selectedFromQuery && file.previewable,
              )
            : undefined;
    const selected: ArtifactFile | null =
        selectedFromFiles ?? pickDefaultPreview(files);
    const directories = listing.directories.slice().sort();
    const subPath = listing.path;
    const isRoot = subPath === "";
    const title = isRoot ? id : `${id} / ${subPath}`;
    const meta = [
        pluralize(files.length, "file"),
        directories.length > 0 ? pluralize(directories.length, "folder") : null,
    ]
        .filter(Boolean)
        .join(", ");

    return (
        <div className="flex h-dvh flex-col">
            <Header
                title={title}
                meta={meta}
                currentId={id}
                recentItems={recentItems}
                isRoot={isRoot}
                subPath={subPath}
                onDeleted={() => setDeleted(true)}
                onReload={() => setReloadToken((token) => token + 1)}
                onError={setActionError}
            />

            {actionError !== null && (
                <p
                    role="alert"
                    className="border-b border-edge px-6 py-2 text-sm text-red-500"
                >
                    {actionError}
                </p>
            )}

            <div
                className={`grid min-h-0 flex-1 transition-[grid-template-columns,grid-template-rows] duration-200 ease-out max-md:grid-rows-[auto_1fr] ${
                    fileListOpen
                        ? "md:grid-cols-[280px_1fr]"
                        : "md:grid-cols-[0_1fr]"
                }`}
            >
                <FileList
                    id={id}
                    subPath={subPath}
                    files={files}
                    directories={directories}
                    activeName={selected?.name ?? null}
                    onPreview={(file) => setFileQueryParam(file.name, false)}
                    open={fileListOpen}
                />
                <PreviewPane
                    id={id}
                    subPath={subPath}
                    files={files}
                    selected={selected}
                    sidebarOpen={fileListOpen}
                    onToggle={() => setFileListOpen((open) => !open)}
                />
            </div>
        </div>
    );
}
