import { useState } from "react";
import { Button } from "./Button";
import { LockDialog } from "./LockDialog";
import { UnlockDialog } from "./UnlockDialog";
import { useArtifactActions, useArtifactState } from "../contexts/useArtifact";
import {
    artifactDownloadUrl,
    setArtifactVisibility,
    shareBasePath,
} from "../lib/artifact";
import {
    ActionIcon,
    DownloadIcon,
    EditIcon,
    EyeIcon,
    LockIcon,
    ShareIcon,
    TrashIcon,
    UploadIcon,
} from "./Icons";

interface ActionsMenuProps {
    renaming: boolean;
    onRename: () => void;
    uploading: boolean;
    onUpload: () => void;
    onDelete: () => void;
}

const MENU_CLOSE_DELAY_MS = 1000;
const COPY_FEEDBACK_MS = 1500;

const ITEM =
    "flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-xs " +
    "text-heading hover:bg-brand-soft disabled:opacity-60";

/**
 * The header's "more actions" dropdown - fully self-contained. It owns its
 * own open/close state, the Share button's copy-feedback state, and the
 * Lock/Unlock dialogs it triggers; the parent only supplies the handful of
 * actions (rename/upload/delete) whose results have to be visible outside
 * the menu.
 */
export function ActionsMenu({
    renaming,
    onRename,
    uploading,
    onUpload,
    onDelete,
}: ActionsMenuProps) {
    const {
        id,
        subPath,
        isRoot,
        canModify,
        locked,
        readOnly,
        token,
        visibility,
        shareToken,
    } = useArtifactState();
    const { reload, reportError } = useArtifactActions();
    const isPrivate = visibility === "private";
    const [open, setOpen] = useState(false);
    const [changingVisibility, setChangingVisibility] = useState(false);
    const [shareLabel, setShareLabel] = useState("Share");
    const [lockDialogOpen, setLockDialogOpen] = useState(false);
    const [unlockDialogOpen, setUnlockDialogOpen] = useState(false);

    // Every item schedules the menu to close shortly after it's clicked,
    // rather than immediately, so the click's visual feedback is still
    // visible when the menu disappears.
    function scheduleClose() {
        window.setTimeout(() => setOpen(false), MENU_CLOSE_DELAY_MS);
    }

    async function onShare() {
        try {
            // Always the read-only /s/ form of the current page - never the
            // owner's `?token=`, so sharing can't hand out edit access.
            const currentUrl = new URL(window.location.href);
            currentUrl.searchParams.delete("token");
            const shareUrl = new URL(
                `${shareBasePath(id, isPrivate ? shareToken : null)}${subPath}${currentUrl.search}`,
                currentUrl.origin,
            );
            await navigator.clipboard.writeText(shareUrl.href);
            setShareLabel("Copied!");
        } catch {
            setShareLabel("Copy failed");
        }
        window.setTimeout(() => setShareLabel("Share"), COPY_FEEDBACK_MS);
    }

    async function onToggleVisibility() {
        if (token === null) return;
        const next = isPrivate ? "public" : "private";
        const message = isPrivate
            ? "Make this artifact public? Anyone with its link will be able to view it."
            : "Make this artifact private? Only people with its share link will be able to view it.";
        if (!window.confirm(message)) return;
        setChangingVisibility(true);
        reportError(null);
        try {
            await setArtifactVisibility(id, next, token);
            reload();
        } catch (error) {
            reportError(
                error instanceof Error
                    ? error.message
                    : "Failed to change visibility.",
            );
        } finally {
            setChangingVisibility(false);
        }
    }

    return (
        <div className="relative">
            <Button
                aria-label="More actions"
                aria-expanded={open}
                onClick={() => setOpen((value) => !value)}
                className="size-7 text-base p-0"
            >
                <ActionIcon className="size-3" />
            </Button>
            {open && (
                <>
                    <div
                        className="fixed inset-0 z-0"
                        onClick={() => setOpen(false)}
                    />
                    <div className="absolute right-0 top-full z-10 mt-1.5 w-44 rounded-lg border border-edge bg-panel p-1.5 shadow-2xl">
                        <button
                            type="button"
                            onClick={() => {
                                scheduleClose();
                                void onShare();
                            }}
                            className={ITEM}
                        >
                            <ShareIcon className="size-3.5 shrink-0" />
                            {shareLabel}
                        </button>
                        <a
                            href={artifactDownloadUrl(
                                id,
                                readOnly && isPrivate ? shareToken : null,
                            )}
                            download
                            onClick={() => scheduleClose()}
                            className={`${ITEM} no-underline`}
                        >
                            <DownloadIcon className="size-3.5 shrink-0" />
                            Download as ZIP
                        </a>
                        {isRoot && canModify && (
                            <button
                                type="button"
                                disabled={renaming}
                                onClick={() => {
                                    scheduleClose();
                                    onRename();
                                }}
                                className={ITEM}
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
                                    onUpload();
                                }}
                                className={ITEM}
                            >
                                <UploadIcon className="size-3.5 shrink-0" />
                                {uploading ? "Uploading…" : "Upload more"}
                            </button>
                        )}
                        {locked && canModify && (
                            <button
                                type="button"
                                disabled={changingVisibility}
                                onClick={() => {
                                    scheduleClose();
                                    void onToggleVisibility();
                                }}
                                className={ITEM}
                            >
                                <EyeIcon className="size-3.5 shrink-0" />
                                {isPrivate ? "Make public" : "Make private"}
                            </button>
                        )}
                        {!locked && !readOnly && (
                            <button
                                type="button"
                                onClick={() => {
                                    scheduleClose();
                                    setLockDialogOpen(true);
                                }}
                                className={ITEM}
                            >
                                <LockIcon className="size-3.5 shrink-0" />
                                Lock
                            </button>
                        )}
                        {locked && !canModify && !readOnly && (
                            <button
                                type="button"
                                onClick={() => {
                                    scheduleClose();
                                    setUnlockDialogOpen(true);
                                }}
                                className={ITEM}
                            >
                                <LockIcon className="size-3.5 shrink-0" />
                                Unlock
                            </button>
                        )}
                        {isRoot && canModify && (
                            <button
                                type="button"
                                aria-label="Delete"
                                onClick={() => {
                                    scheduleClose();
                                    onDelete();
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

            {lockDialogOpen && (
                <LockDialog onClose={() => setLockDialogOpen(false)} />
            )}

            {unlockDialogOpen && (
                <UnlockDialog onClose={() => setUnlockDialogOpen(false)} />
            )}
        </div>
    );
}
