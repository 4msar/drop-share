import { Button } from "./Button";
import {
    ActionIcon,
    EditIcon,
    LockIcon,
    ShareIcon,
    TrashIcon,
    UploadIcon,
} from "./Icons";

interface ActionsMenuProps {
    open: boolean;
    onToggle: () => void;
    onRequestClose: () => void;
    shareLabel: string;
    onShare: () => void;
    isRoot: boolean;
    canModify: boolean;
    renaming: boolean;
    onRename: () => void;
    uploading: boolean;
    onUpload: () => void;
    locked: boolean;
    onOpenLock: () => void;
    onOpenUnlock: () => void;
    onDelete: () => void;
}

const ITEM =
    "flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-xs " +
    "text-heading hover:bg-brand-soft disabled:opacity-60";

/**
 * The header's "more actions" dropdown - purely presentational. The parent
 * owns the open/close state so it can also close the menu from outside a
 * menu click (e.g. once a triggered upload finishes).
 */
export function ActionsMenu({
    open,
    onToggle,
    onRequestClose,
    shareLabel,
    onShare,
    isRoot,
    canModify,
    renaming,
    onRename,
    uploading,
    onUpload,
    locked,
    onOpenLock,
    onOpenUnlock,
    onDelete,
}: ActionsMenuProps) {
    return (
        <div className="relative">
            <Button
                aria-label="More actions"
                aria-expanded={open}
                onClick={onToggle}
                className="size-7 text-base p-0"
            >
                <ActionIcon className="size-3" />
            </Button>
            {open && (
                <>
                    <div
                        className="fixed inset-0 z-0"
                        onClick={onRequestClose}
                    />
                    <div className="absolute right-0 top-full z-10 mt-1.5 w-44 rounded-lg border border-edge bg-panel p-1.5 shadow-2xl">
                        <button type="button" onClick={onShare} className={ITEM}>
                            <ShareIcon className="size-3.5 shrink-0" />
                            {shareLabel}
                        </button>
                        {isRoot && canModify && (
                            <button
                                type="button"
                                disabled={renaming}
                                onClick={onRename}
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
                                onClick={onUpload}
                                className={ITEM}
                            >
                                <UploadIcon className="size-3.5 shrink-0" />
                                {uploading ? "Uploading…" : "Upload more"}
                            </button>
                        )}
                        {!locked && (
                            <button
                                type="button"
                                onClick={onOpenLock}
                                className={ITEM}
                            >
                                <LockIcon className="size-3.5 shrink-0" />
                                Lock
                            </button>
                        )}
                        {locked && !canModify && (
                            <button
                                type="button"
                                onClick={onOpenUnlock}
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
                                onClick={onDelete}
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
    );
}
