import { useState } from "react";
import { Button } from "./Button";
import { LockDialog } from "./LockDialog";
import { UnlockDialog } from "./UnlockDialog";
import {
    ActionIcon,
    EditIcon,
    LockIcon,
    ShareIcon,
    TrashIcon,
    UploadIcon,
} from "./Icons";
import { useParams } from "react-router";

interface ActionsMenuProps {
    subPath: string;
    isRoot: boolean;
    canModify: boolean;
    locked: boolean;
    renaming: boolean;
    onRename: () => void;
    uploading: boolean;
    onUpload: () => void;
    onDelete: () => void;
    onTokenObtained: (token: string) => void;
    onError: (message: string | null) => void;
}

const MENU_CLOSE_DELAY_MS = 1000;
const COPY_FEEDBACK_MS = 1500;

const ITEM =
    "flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-xs " +
    "text-heading hover:bg-brand-soft disabled:opacity-60";

/**
 * The header's "more actions" dropdown - fully self-contained. It owns its
 * own open/close state, the Share button's copy-feedback state, and the
 * Lock/Unlock dialogs it triggers; the parent only supplies artifact data
 * and the handful of actions (rename/upload/delete) whose results have to
 * be visible outside the menu.
 */
export function ActionsMenu({
    subPath,
    isRoot,
    canModify,
    locked,
    renaming,
    onRename,
    uploading,
    onUpload,
    onDelete,
    onTokenObtained,
    onError,
}: ActionsMenuProps) {
    const params = useParams();
    const currentId = params.id ?? "";
    const [open, setOpen] = useState(false);
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
            const currentUrl = new URL(window.location.href);
            if (currentUrl.searchParams.has("token")) {
                currentUrl.searchParams.delete("token");
            }
            await navigator.clipboard.writeText(currentUrl.href);
            setShareLabel("Copied!");
        } catch {
            setShareLabel("Copy failed");
        }
        window.setTimeout(() => setShareLabel("Share"), COPY_FEEDBACK_MS);
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
                                    scheduleClose();
                                    onUpload();
                                }}
                                className={ITEM}
                            >
                                <UploadIcon className="size-3.5 shrink-0" />
                                {uploading ? "Uploading…" : "Upload more"}
                            </button>
                        )}
                        {!locked && (
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
                        {locked && !canModify && (
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
                <LockDialog
                    artifactId={currentId}
                    onClose={() => setLockDialogOpen(false)}
                    onLocked={onTokenObtained}
                    onError={onError}
                />
            )}

            {unlockDialogOpen && (
                <UnlockDialog
                    artifactId={currentId}
                    subPath={subPath}
                    onClose={() => setUnlockDialogOpen(false)}
                    onUnlocked={onTokenObtained}
                    onError={onError}
                />
            )}
        </div>
    );
}
