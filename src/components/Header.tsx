import { useCallback, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "./Button";
import { RecentSwitcher } from "./RecentSwitcher";
import { deleteArtifact, uploadIntoArtifact } from "../lib/artifact";
import { removeRecentItem } from "../lib/recent";
import type { RecentItem } from "../lib/recent";
import { toggleTheme } from "../lib/theme";
import {
    ActionIcon,
    ShareIcon,
    ThemeIcon,
    TrashIcon,
    UploadIcon,
} from "./Icons";

const DELETED_REDIRECT_DELAY_MS = 3000;
const COPY_FEEDBACK_MS = 1500;

interface HeaderProps {
    title: string;
    meta: string;
    currentId: string;
    subPath: string;
    recentItems: RecentItem[];
    isRoot: boolean;
    onDeleted: () => void;
    onReload: () => void;
    onError: (message: string | null) => void;
}

export function Header({
    title,
    meta,
    currentId,
    subPath,
    recentItems,
    isRoot,
    onDeleted,
    onReload,
    onError,
}: HeaderProps) {
    const navigate = useNavigate();
    const [actionsOpen, setActionsOpen] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [shareLabel, setShareLabel] = useState("Share");
    const uploadInputRef = useRef<HTMLInputElement>(null);

    const onShare = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(window.location.href);
            setShareLabel("Copied!");
        } catch {
            setShareLabel("Copy failed");
        }
        window.setTimeout(() => setShareLabel("Share"), COPY_FEEDBACK_MS);
    }, []);

    const delayedAction = useCallback(() => {
        window.setTimeout(() => {
            setActionsOpen(false);
        }, 1000);
    }, []);

    const onDelete = useCallback(async () => {
        if (
            !window.confirm(
                "Delete this artifact permanently? This cannot be undone.",
            )
        )
            return;
        try {
            await deleteArtifact(currentId);
            removeRecentItem(currentId);
            onDeleted();
            window.setTimeout(
                () => void navigate("/"),
                DELETED_REDIRECT_DELAY_MS,
            );
        } catch (error) {
            onError(
                error instanceof Error
                    ? error.message
                    : "Failed to delete artifact.",
            );
        }
    }, [currentId, navigate, onDeleted, onError]);

    const onUploadFiles = useCallback(
        async (files: File[]) => {
            if (files.length === 0) return;
            setUploading(true);
            onError(null);
            try {
                await uploadIntoArtifact(currentId, subPath, files);
                onReload();
            } catch (error) {
                onError(
                    error instanceof Error ? error.message : "Upload failed.",
                );
            } finally {
                setUploading(false);
                if (uploadInputRef.current) uploadInputRef.current.value = "";
            }
        },
        [currentId, onError, onReload, subPath],
    );

    return (
        <header className="relative z-20 flex h-9 shrink-0 items-center justify-between border-b border-edge bg-surface px-2">
            <div className="flex min-w-0 items-center gap-1">
                <Link
                    to="/"
                    aria-label="Drop Share home"
                    className="grid size-7 shrink-0 place-items-center rounded-md border border-edge bg-panel text-heading transition-colors hover:border-brand-edge"
                >
                    <img src="/logo.svg" alt="" className="size-5" />
                </Link>
                <RecentSwitcher
                    title={title}
                    currentId={currentId}
                    items={recentItems}
                />
                <span className="hidden truncate text-xs text-body sm:inline">
                    {meta}
                </span>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
                <input
                    ref={uploadInputRef}
                    type="file"
                    multiple
                    hidden
                    aria-label="Add files to this folder"
                    onChange={(event) => {
                        onUploadFiles(Array.from(event.target.files ?? []));
                    }}
                />
                <Button
                    type="button"
                    aria-label="Toggle theme"
                    title="Toggle theme"
                    onClick={() => {
                        const prefersDark = window.matchMedia(
                            "(prefers-color-scheme: dark)",
                        ).matches;
                        const next = toggleTheme(
                            document.documentElement,
                            prefersDark,
                        );
                        document.documentElement.style.colorScheme = next;
                    }}
                    className="size-7 text-base text-heading p-0"
                >
                    <ThemeIcon className="size-3" />
                </Button>
                <div className="relative">
                    <Button
                        aria-expanded={actionsOpen}
                        onClick={() => setActionsOpen((open) => !open)}
                        className="size-7 text-base p-0"
                    >
                        <ActionIcon className="size-3" />
                    </Button>
                    {actionsOpen && (
                        <>
                            <div
                                className="fixed inset-0 z-0"
                                onClick={() => setActionsOpen(false)}
                            />
                            <div className="absolute right-0 top-full z-10 mt-1.5 w-44 rounded-lg border border-edge bg-panel p-1.5 shadow-2xl">
                                <button
                                    type="button"
                                    onClick={() => {
                                        delayedAction();
                                        void onShare();
                                    }}
                                    className="flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-xs text-heading hover:bg-brand-soft"
                                >
                                    <ShareIcon className="size-3.5 shrink-0" />
                                    {shareLabel}
                                </button>
                                <button
                                    type="button"
                                    disabled={uploading}
                                    onClick={() => {
                                        delayedAction();
                                        uploadInputRef.current?.click();
                                    }}
                                    className="flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-xs text-heading hover:bg-brand-soft disabled:opacity-60"
                                >
                                    <UploadIcon className="size-3.5 shrink-0" />
                                    {uploading ? "Uploading…" : "Upload more"}
                                </button>
                                {isRoot && (
                                    <button
                                        type="button"
                                        aria-label="Delete"
                                        onClick={() => {
                                            delayedAction();
                                            void onDelete();
                                        }}
                                        className="flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-xs text-red-500 hover:bg-red-500/10"
                                    >
                                        <TrashIcon className="size-3.5 shrink-0" />
                                        Delete
                                    </button>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </header>
    );
}
