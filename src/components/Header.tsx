import { useCallback, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "./Button";
import { RecentSwitcher } from "./RecentSwitcher";
import {
    deleteArtifact,
    fetchArtifactListing,
    lockArtifact,
    updateArtifactLabel,
    uploadIntoArtifact,
} from "../lib/artifact";
import { hashPassword } from "../lib/hash";
import { removeRecentItem } from "../lib/recent";
import type { RecentItem } from "../lib/recent";
import { toggleTheme } from "../lib/theme";
import { removeToken, saveToken } from "../lib/tokens";
import {
    ActionIcon,
    EditIcon,
    LockIcon,
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
    locked: boolean;
    canModify: boolean;
    label?: string;
    token: string | null;
    onDeleted: () => void;
    onReload: () => void;
    onError: (message: string | null) => void;
    onLocked: (token: string) => void;
    onUnlocked: (token: string) => void;
}

export function Header({
    title,
    meta,
    currentId,
    subPath,
    recentItems,
    isRoot,
    locked,
    canModify,
    label,
    token,
    onDeleted,
    onReload,
    onError,
    onLocked,
    onUnlocked,
}: HeaderProps) {
    const navigate = useNavigate();
    const [actionsOpen, setActionsOpen] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [locking, setLocking] = useState(false);
    const [renaming, setRenaming] = useState(false);
    const [lockPromptOpen, setLockPromptOpen] = useState(false);
    const [lockPassword, setLockPassword] = useState("");
    const [lockPasswordConfirm, setLockPasswordConfirm] = useState("");
    const [lockSuccess, setLockSuccess] = useState(false);
    const [unlockPromptOpen, setUnlockPromptOpen] = useState(false);
    const [unlockPassword, setUnlockPassword] = useState("");
    const [unlocking, setUnlocking] = useState(false);
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
            await deleteArtifact(currentId, token);
            removeRecentItem(currentId);
            removeToken(currentId);
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
    }, [currentId, navigate, onDeleted, onError, token]);

    const onUploadFiles = useCallback(
        async (files: File[]) => {
            if (files.length === 0) return;
            setUploading(true);
            onError(null);
            try {
                await uploadIntoArtifact(currentId, subPath, files, token);
                onReload();
            } catch (error) {
                onError(
                    error instanceof Error ? error.message : "Upload failed.",
                );
            } finally {
                setUploading(false);
                if (uploadInputRef.current) uploadInputRef.current.value = "";
                delayedAction();
            }
        },
        [currentId, onError, onReload, delayedAction, subPath, token],
    );

    const onOpenLockPrompt = useCallback(() => {
        setLockPassword("");
        setLockPasswordConfirm("");
        setLockPromptOpen(true);
    }, []);

    const onCancelLockPrompt = useCallback(() => {
        setLockPromptOpen(false);
    }, []);

    const onSubmitLock = useCallback(async () => {
        if (lockPassword === "") {
            onError("A password is required to lock this artifact.");
            return;
        }
        if (lockPassword !== lockPasswordConfirm) {
            onError("Passwords do not match.");
            return;
        }
        setLocking(true);
        onError(null);
        try {
            const token = await hashPassword(currentId, lockPassword);
            await lockArtifact(currentId, token);
            saveToken(currentId, token);
            setLockPromptOpen(false);
            setLockSuccess(true);
            onLocked(token);
        } catch (error) {
            onError(
                error instanceof Error
                    ? error.message
                    : "Failed to lock artifact.",
            );
        } finally {
            setLocking(false);
        }
    }, [currentId, lockPassword, lockPasswordConfirm, onError, onLocked]);

    const onOpenUnlockPrompt = useCallback(() => {
        setUnlockPassword("");
        setUnlockPromptOpen(true);
    }, []);

    const onCancelUnlockPrompt = useCallback(() => {
        setUnlockPromptOpen(false);
    }, []);

    const onSubmitUnlock = useCallback(async () => {
        if (unlockPassword === "") {
            onError("A password is required to unlock this artifact.");
            return;
        }
        setUnlocking(true);
        onError(null);
        try {
            const candidateToken = await hashPassword(
                currentId,
                unlockPassword,
            );
            const listing = await fetchArtifactListing(
                currentId,
                subPath,
                candidateToken,
            );
            if (!listing.canModify) {
                onError("Incorrect password.");
                return;
            }
            saveToken(currentId, candidateToken);
            setUnlockPromptOpen(false);
            onUnlocked(candidateToken);
        } catch (error) {
            onError(
                error instanceof Error
                    ? error.message
                    : "Failed to unlock artifact.",
            );
        } finally {
            setUnlocking(false);
        }
    }, [currentId, subPath, unlockPassword, onError, onUnlocked]);

    const onRename = useCallback(async () => {
        const next = window.prompt("Rename this artifact", label ?? "");
        if (next === null) return;
        const trimmed = next.trim();
        if (trimmed === "" || trimmed === label) return;
        setRenaming(true);
        onError(null);
        try {
            await updateArtifactLabel(currentId, trimmed, token);
            onReload();
        } catch (error) {
            onError(
                error instanceof Error
                    ? error.message
                    : "Failed to rename artifact.",
            );
        } finally {
            setRenaming(false);
        }
    }, [currentId, label, onError, onReload, token]);

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
                        aria-label="More actions"
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
                                {isRoot && canModify && (
                                    <button
                                        type="button"
                                        disabled={renaming}
                                        onClick={() => {
                                            delayedAction();
                                            void onRename();
                                        }}
                                        className="flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-xs text-heading hover:bg-brand-soft disabled:opacity-60"
                                    >
                                        <EditIcon className="size-3.5 shrink-0" />
                                        {renaming ? "Renaming…" : "Rename"}
                                    </button>
                                )}
                                {canModify && (
                                    <button
                                        type="button"
                                        disabled={uploading}
                                        onClick={() => {
                                            uploadInputRef.current?.click();
                                        }}
                                        className="flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-xs text-heading hover:bg-brand-soft disabled:opacity-60"
                                    >
                                        <UploadIcon className="size-3.5 shrink-0" />
                                        {uploading
                                            ? "Uploading…"
                                            : "Upload more"}
                                    </button>
                                )}
                                {!locked && (
                                    <button
                                        type="button"
                                        disabled={locking}
                                        onClick={() => {
                                            delayedAction();
                                            onOpenLockPrompt();
                                        }}
                                        className="flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-xs text-heading hover:bg-brand-soft disabled:opacity-60"
                                    >
                                        <LockIcon className="size-3.5 shrink-0" />
                                        {locking ? "Locking…" : "Lock"}
                                    </button>
                                )}
                                {locked && !canModify && (
                                    <button
                                        type="button"
                                        disabled={unlocking}
                                        onClick={() => {
                                            delayedAction();
                                            onOpenUnlockPrompt();
                                        }}
                                        className="flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-xs text-heading hover:bg-brand-soft disabled:opacity-60"
                                    >
                                        <LockIcon className="size-3.5 shrink-0" />
                                        {unlocking ? "Unlocking…" : "Unlock"}
                                    </button>
                                )}
                                {isRoot && canModify && (
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

            {lockPromptOpen && (
                <div className="fixed inset-0 z-30 grid place-items-center bg-black/40 p-4">
                    <form
                        className="w-full max-w-sm rounded-2xl border border-edge bg-panel p-5 shadow-2xl"
                        onSubmit={(event) => {
                            event.preventDefault();
                            void onSubmitLock();
                        }}
                    >
                        <h2 className="mb-2 text-sm font-medium text-heading">
                            Lock this artifact
                        </h2>
                        <p className="mb-3 text-xs text-body">
                            Choose a password needed to make future changes - it
                            can&apos;t be recovered if lost.
                        </p>
                        <label
                            htmlFor="lock-password"
                            className="mb-1 block text-xs text-body"
                        >
                            Password
                        </label>
                        <input
                            id="lock-password"
                            type="password"
                            autoComplete="new-password"
                            placeholder="Enter a password"
                            value={lockPassword}
                            onChange={(event) =>
                                setLockPassword(event.target.value)
                            }
                            className="mb-3 w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-xs"
                        />
                        <label
                            htmlFor="lock-password-confirm"
                            className="mb-1 block text-xs text-body"
                        >
                            Confirm password
                        </label>
                        <input
                            id="lock-password-confirm"
                            type="password"
                            autoComplete="new-password"
                            placeholder="Confirm password"
                            value={lockPasswordConfirm}
                            onChange={(event) =>
                                setLockPasswordConfirm(event.target.value)
                            }
                            className="mb-4 w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-xs"
                        />
                        <div className="flex gap-2">
                            <Button
                                type="button"
                                size="sm"
                                className="flex-1"
                                onClick={onCancelLockPrompt}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                variant="primary"
                                size="sm"
                                className="flex-1"
                                disabled={locking}
                            >
                                {locking ? "Locking…" : "Lock artifact"}
                            </Button>
                        </div>
                    </form>
                </div>
            )}

            {lockSuccess && (
                <div className="fixed inset-0 z-30 grid place-items-center bg-black/40 p-4">
                    <div className="w-full max-w-sm rounded-2xl border border-edge bg-panel p-5 shadow-2xl">
                        <h2 className="mb-2 text-sm font-medium text-heading">
                            Artifact locked
                        </h2>
                        <p className="mb-4 text-xs text-body">
                            Your password is now required to make further
                            changes. Keep it safe - it can&apos;t be recovered
                            if forgotten.
                        </p>
                        <Button
                            variant="primary"
                            size="sm"
                            className="w-full"
                            onClick={() => setLockSuccess(false)}
                        >
                            Done
                        </Button>
                    </div>
                </div>
            )}

            {unlockPromptOpen && (
                <div className="fixed inset-0 z-30 grid place-items-center bg-black/40 p-4">
                    <form
                        className="w-full max-w-sm rounded-2xl border border-edge bg-panel p-5 shadow-2xl"
                        onSubmit={(event) => {
                            event.preventDefault();
                            void onSubmitUnlock();
                        }}
                    >
                        <h2 className="mb-2 text-sm font-medium text-heading">
                            Unlock this artifact
                        </h2>
                        <p className="mb-3 text-xs text-body">
                            Enter the password this artifact was locked with to
                            make changes.
                        </p>
                        <label
                            htmlFor="unlock-password"
                            className="mb-1 block text-xs text-body"
                        >
                            Password
                        </label>
                        <input
                            id="unlock-password"
                            type="password"
                            autoComplete="current-password"
                            placeholder="Enter the password"
                            value={unlockPassword}
                            onChange={(event) =>
                                setUnlockPassword(event.target.value)
                            }
                            className="mb-4 w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-xs"
                        />
                        <div className="flex gap-2">
                            <Button
                                type="button"
                                size="sm"
                                className="flex-1"
                                onClick={onCancelUnlockPrompt}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                variant="primary"
                                size="sm"
                                className="flex-1"
                                disabled={unlocking}
                            >
                                {unlocking ? "Unlocking…" : "Unlock artifact"}
                            </Button>
                        </div>
                    </form>
                </div>
            )}
        </header>
    );
}
