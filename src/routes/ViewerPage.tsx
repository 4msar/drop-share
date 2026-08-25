import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Button } from "../components/Button";
import { FileList } from "../components/FileList";
import { PreviewPane } from "../components/PreviewPane";
import { RecentSwitcher } from "../components/RecentSwitcher";
import {
    type ArtifactFile,
    type ArtifactListing,
    ArtifactNotFoundError,
    deleteArtifact,
    fetchArtifactListing,
    fileUrl,
    pickDefaultPreview,
    previewUrl,
    sortFiles,
    uploadIntoArtifact,
} from "../lib/artifact";
import { pluralize } from "../lib/format";
import { addRecentItem, type RecentItem, getRecentItems } from "../lib/recent";

const DELETED_REDIRECT_DELAY_MS = 3000;
const COPY_FEEDBACK_MS = 1500;

type Selected = { file: ArtifactFile; showSource: boolean } | null;

export default function ViewerPage() {
    const params = useParams();
    const navigate = useNavigate();
    const id = params.id ?? "";
    // The route's path is what we fetch; what we *render* comes from the
    // listing itself (see `subPath` below), so a folder navigation can never
    // pair the new path with the previous folder's file names.
    const routePath = params["*"] ?? "";

    const [listing, setListing] = useState<ArtifactListing | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [selected, setSelected] = useState<Selected>(null);
    const [deleted, setDeleted] = useState(false);
    const [shareLabel, setShareLabel] = useState("Share");
    const [uploading, setUploading] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const [reloadToken, setReloadToken] = useState(0);
    const [recentItems, setRecentItems] = useState<RecentItem[]>(() =>
        getRecentItems(),
    );
    const uploadInputRef = useRef<HTMLInputElement>(null);

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
                const preview = pickDefaultPreview(sortFiles(next.files));
                setSelected(
                    preview ? { file: preview, showSource: false } : null,
                );
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

    const onShare = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(window.location.href);
            setShareLabel("Copied!");
        } catch {
            setShareLabel("Copy failed");
        }
        window.setTimeout(() => setShareLabel("Share"), COPY_FEEDBACK_MS);
    }, []);

    const onDelete = useCallback(async () => {
        if (
            !window.confirm(
                "Delete this artifact permanently? This cannot be undone.",
            )
        ) {
            return;
        }
        try {
            await deleteArtifact(id);
            setDeleted(true);
            window.setTimeout(
                () => void navigate("/"),
                DELETED_REDIRECT_DELAY_MS,
            );
        } catch (error) {
            setActionError(
                error instanceof Error
                    ? error.message
                    : "Failed to delete artifact.",
            );
        }
    }, [id, navigate]);

    const onUploadFiles = useCallback(
        async (files: File[]) => {
            if (files.length === 0) return;
            setUploading(true);
            setActionError(null);
            try {
                await uploadIntoArtifact(id, routePath, files);
                setReloadToken((token) => token + 1);
            } catch (error) {
                setActionError(
                    error instanceof Error ? error.message : "Upload failed.",
                );
            } finally {
                setUploading(false);
                if (uploadInputRef.current) uploadInputRef.current.value = "";
            }
        },
        [id, routePath],
    );

    if (deleted) {
        return (
            <main
                role="status"
                className="grid min-h-dvh place-items-center p-6"
            >
                <section className="w-full max-w-md rounded-3xl border border-edge p-8 text-center shadow-lg">
                    <div
                        className="mx-auto mb-4 grid size-13 place-items-center rounded-full bg-green-100 text-2xl text-green-700"
                        aria-hidden="true"
                    >
                        ✓
                    </div>
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

    const previewSrc =
        selected === null
            ? null
            : selected.showSource
              ? fileUrl(id, subPath, selected.file.name)
              : previewUrl(id, subPath, selected.file);

    const placeholder =
        files.length === 0
            ? "This folder only contains subfolders — open one from the list."
            : "No preview available for these files — click one in the list to download it.";

    return (
        <div className="flex h-dvh flex-col">
            <header className="flex flex-wrap items-start justify-between gap-4 border-b border-edge px-6 py-4">
                <div className="min-w-0 flex items-center gap-2 flex-wrap">
                    <Link
                        to="/"
                        className="flex-1 sm:flex-auto flex justify-center min-w-8"
                    >
                        <img src="/logo.svg" alt="" className="size-8" />
                    </Link>
                    <h1 className="mb-0.5 break-all text-lg font-medium text-heading flex items-center gap-2">
                        <RecentSwitcher
                            title={title ?? id}
                            currentId={id}
                            items={recentItems}
                        />
                    </h1>
                    <p className="text-[13px] text-body">{meta}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                    <Button
                        disabled={uploading}
                        onClick={() => uploadInputRef.current?.click()}
                    >
                        {uploading ? "Uploading…" : "Upload More"}
                    </Button>
                    <input
                        ref={uploadInputRef}
                        type="file"
                        multiple
                        hidden
                        aria-label="Add files to this folder"
                        onChange={(event) =>
                            void onUploadFiles(
                                Array.from(event.target.files ?? []),
                            )
                        }
                    />
                    <Button onClick={() => void onShare()}>{shareLabel}</Button>
                    {isRoot && (
                        <Button
                            variant="danger"
                            onClick={() => void onDelete()}
                        >
                            Delete
                        </Button>
                    )}
                </div>
            </header>

            {actionError !== null && (
                <p
                    role="alert"
                    className="border-b border-edge px-6 py-2 text-sm text-red-500"
                >
                    {actionError}
                </p>
            )}

            <div className="grid min-h-0 flex-1 md:grid-cols-[280px_1fr] max-md:grid-rows-[auto_1fr]">
                <FileList
                    id={id}
                    subPath={subPath}
                    files={files}
                    directories={directories}
                    activeName={selected?.file.name ?? null}
                    onPreview={(file) =>
                        setSelected({ file, showSource: false })
                    }
                />
                <PreviewPane
                    src={previewSrc}
                    placeholder={placeholder}
                    canToggleSource={selected?.file.markdown ?? false}
                    showingSource={selected?.showSource ?? false}
                    onToggleSource={() =>
                        setSelected((current) =>
                            current === null
                                ? null
                                : {
                                      ...current,
                                      showSource: !current.showSource,
                                  },
                        )
                    }
                />
            </div>
        </div>
    );
}
