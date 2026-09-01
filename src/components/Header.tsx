import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ActionsMenu } from "./ActionsMenu";
import { RecentSwitcher } from "./RecentSwitcher";
import {
    deleteArtifact,
    updateArtifactLabel,
    uploadIntoArtifact,
} from "../lib/artifact";
import { useArtifactActions, useArtifactState } from "../contexts/useArtifact";
import { useRecentItemsActions } from "../contexts/useRecentItems";
import { useThemeActions } from "../contexts/useTheme";
import { removeToken } from "../lib/tokens";
import { Button } from "./Button";
import { ThemeIcon } from "./Icons";

const DELETED_REDIRECT_DELAY_MS = 3000;

export function Header() {
    const navigate = useNavigate();
    const { id: currentId, subPath, isRoot, label, token } = useArtifactState();
    const { reload, reportError, markDeleted } = useArtifactActions();
    const { removeItem } = useRecentItemsActions();
    const { toggleTheme } = useThemeActions();
    const [uploading, setUploading] = useState(false);
    const [renaming, setRenaming] = useState(false);
    const uploadInputRef = useRef<HTMLInputElement>(null);

    async function onDelete() {
        if (
            !window.confirm(
                "Delete this artifact permanently? This cannot be undone.",
            )
        )
            return;
        try {
            await deleteArtifact(currentId, token);
            removeItem(currentId);
            removeToken(currentId);
            markDeleted();
            window.setTimeout(
                () => void navigate("/"),
                DELETED_REDIRECT_DELAY_MS,
            );
        } catch (error) {
            reportError(
                error instanceof Error
                    ? error.message
                    : "Failed to delete artifact.",
            );
        }
    }

    async function onUploadFiles(files: File[]) {
        if (files.length === 0) return;
        setUploading(true);
        reportError(null);
        try {
            await uploadIntoArtifact(currentId, subPath, files, token);
            reload();
        } catch (error) {
            reportError(
                error instanceof Error ? error.message : "Upload failed.",
            );
        } finally {
            setUploading(false);
            if (uploadInputRef.current) uploadInputRef.current.value = "";
        }
    }

    async function onRename() {
        const next = window.prompt("Rename this artifact", label ?? "");
        if (next === null) return;
        const trimmed = next.trim();
        if (trimmed === "" || trimmed === label) return;
        setRenaming(true);
        reportError(null);
        try {
            await updateArtifactLabel(currentId, trimmed, token);
            reload();
        } catch (error) {
            reportError(
                error instanceof Error
                    ? error.message
                    : "Failed to rename artifact.",
            );
        } finally {
            setRenaming(false);
        }
    }

    const title = label || currentId;
    const meta = isRoot ? "" : `/${subPath}`;

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
                <RecentSwitcher title={title} />
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
                        void onUploadFiles(Array.from(event.target.files ?? []));
                    }}
                />
                <Button
                    type="button"
                    aria-label="Toggle theme"
                    title="Toggle theme"
                    onClick={toggleTheme}
                    className="size-7 text-base text-heading p-0"
                >
                    <ThemeIcon className="size-3" />
                </Button>
                <ActionsMenu
                    renaming={renaming}
                    onRename={() => void onRename()}
                    uploading={uploading}
                    onUpload={() => uploadInputRef.current?.click()}
                    onDelete={() => void onDelete()}
                />
            </div>
        </header>
    );
}
