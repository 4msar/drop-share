import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ActionsMenu } from "./ActionsMenu";
import { RecentSwitcher } from "./RecentSwitcher";
import {
    deleteArtifact,
    updateArtifactLabel,
    uploadIntoArtifact,
} from "../lib/artifact";
import { removeRecentItem } from "../lib/recent";
import type { RecentItem } from "../lib/recent";
import { toggleDocumentTheme } from "../lib/theme";
import { removeToken } from "../lib/tokens";
import { Button } from "./Button";
import { ThemeIcon } from "./Icons";

const DELETED_REDIRECT_DELAY_MS = 3000;

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
    onTokenObtained: (token: string) => void;
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
    onTokenObtained,
}: HeaderProps) {
    const navigate = useNavigate();
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
    }

    async function onUploadFiles(files: File[]) {
        if (files.length === 0) return;
        setUploading(true);
        onError(null);
        try {
            await uploadIntoArtifact(currentId, subPath, files, token);
            onReload();
        } catch (error) {
            onError(error instanceof Error ? error.message : "Upload failed.");
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
    }

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
                        void onUploadFiles(
                            Array.from(event.target.files ?? []),
                        );
                    }}
                />
                <Button
                    type="button"
                    aria-label="Toggle theme"
                    title="Toggle theme"
                    onClick={() => toggleDocumentTheme()}
                    className="size-7 text-base text-heading p-0"
                >
                    <ThemeIcon className="size-3" />
                </Button>
                <ActionsMenu
                    subPath={subPath}
                    isRoot={isRoot}
                    canModify={canModify}
                    locked={locked}
                    renaming={renaming}
                    onRename={() => void onRename()}
                    uploading={uploading}
                    onUpload={() => uploadInputRef.current?.click()}
                    onDelete={() => void onDelete()}
                    onTokenObtained={onTokenObtained}
                    onError={onError}
                />
            </div>
        </header>
    );
}
