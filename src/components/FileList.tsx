import { Link } from "react-router";
import type { ArtifactFile, FileSortMode } from "../lib/artifact";
import { fileUrl, parentPath, withToken } from "../lib/artifact";
import {
    ARCHIVE_EXTENSIONS,
    formatBytes,
    IMAGE_EXTENSIONS,
} from "../lib/format";
import { cn } from "../lib/utils";
import { useArtifactState } from "../contexts/useArtifact";
import {
    ArchiveIcon,
    ChevronIcon,
    FileIcon,
    FolderIcon,
    ImageIcon,
    ParentFolderIcon,
    PdfFileIcon,
} from "./Icons";

/** A glyph hint for a file row in the viewer sidebar. Cosmetic only. */
function fileIcon(name: string) {
    const extension = name.slice(name.lastIndexOf(".") + 1).toLowerCase();

    if (IMAGE_EXTENSIONS.has(extension)) return <ImageIcon />;
    if (ARCHIVE_EXTENSIONS.has(extension)) return <ArchiveIcon />;
    if (extension === "pdf") return <PdfFileIcon />;
    return <FileIcon />;
}

const ROW =
    "flex h-9 items-center gap-2 rounded-md px-2.5 py-1 hover:bg-brand-soft " +
    "focus-within:bg-brand-soft transition-all";
const NAME =
    "flex-1 truncate break-all text-xs no-underline hover:underline transition-all";

/** A small "open in its own tab" affordance, separate from the preview click. */
function OpenInTab({ href, label }: { href: string; label: string }) {
    return (
        <a
            className="grid size-6 shrink-0 place-items-center rounded-sm text-sm text-body/50 no-underline transition-all hover:bg-brand-soft hover:text-brand focus-visible:bg-brand-soft focus-visible:text-brand focus-visible:outline-none"
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${label} in a new tab`}
            title="Open in new tab"
        >
            ↗
        </a>
    );
}

interface FileListProps {
    files: ArtifactFile[];
    directories: string[];
    activeName: string | null;
    sortMode: FileSortMode;
    onSortModeChange: (mode: FileSortMode) => void;
    onPreview: (file: ArtifactFile) => void;
    open: boolean;
}

export function FileList({
    files,
    directories,
    activeName,
    sortMode,
    onSortModeChange,
    onPreview,
    open,
}: FileListProps) {
    const { id, subPath, token } = useArtifactState();
    const parent = parentPath(subPath);

    return (
        <nav
            aria-label="Files in this artifact"
            className={`relative overflow-hidden border-edge transition-[max-height,width] duration-200 ease-out ${open ? "overflow-x-visible overflow-y-auto max-md:max-h-[25vh] max-md:border-b md:border-r" : "max-md:max-h-0 max-md:border-b md:w-9 md:border-r"}`}
        >
            {open && (
                <div className="flex items-center justify-between border-b border-edge px-2 py-2">
                    <button
                        className="text-[10px] font-medium uppercase tracking-[0.18em] text-body/60 flex items-center gap-1 transition-all hover:text-brand focus-visible:text-brand focus-visible:outline-none"
                        onClick={() =>
                            onSortModeChange(
                                sortMode === "newest" ? "name" : "newest",
                            )
                        }
                        title={`Sort by ${sortMode === "newest" ? "newest" : "name (a-z)"}`}
                    >
                        <span>Files</span>
                        <ChevronIcon
                            type={sortMode === "newest" ? "down" : "up"}
                        />
                    </button>

                    <span className="text-[10px] font-medium lowercase tracking-normal text-body/60">
                        {files.length + directories.length} items
                    </span>
                </div>
            )}
            <ul
                className={`flex flex-col gap-1 p-2 transition-opacity duration-200 ease-out ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
            >
                {parent !== null && (
                    <li className={ROW}>
                        <span aria-hidden="true">
                            <FolderIcon className="size-4" />
                        </span>
                        <Link
                            className={NAME}
                            to={withToken(`/a/${id}/${parent}`, token)}
                        >
                            .. (parent directory)
                        </Link>
                    </li>
                )}

                {directories.map((dir) => (
                    <li key={dir} className={ROW}>
                        <ParentFolderIcon className="size-4" />
                        <Link
                            className={NAME}
                            to={withToken(`/a/${id}/${subPath}${dir}`, token)}
                        >
                            {dir}
                        </Link>
                        <OpenInTab
                            href={`/a/${id}/${subPath}${dir}`}
                            label={dir}
                        />
                    </li>
                ))}

                {files.map((file) => {
                    const href = fileUrl(id, subPath, file.name);
                    const isActive = file.name === activeName;
                    return (
                        <li
                            key={file.name}
                            className={`${ROW} ${isActive ? "bg-brand-soft" : ""} ${
                                file.previewable ? "cursor-pointer" : ""
                            }`}
                        >
                            {fileIcon(file.name)}
                            <a
                                className={cn(
                                    NAME,
                                    isActive ? "font-medium text-brand" : "",
                                )}
                                title={file.name}
                                href={href}
                                onClick={
                                    file.previewable
                                        ? (event) => {
                                              // Previewable files open in the pane; the href stays a
                                              // real URL so middle-click and copy-link still work.
                                              event.preventDefault();
                                              onPreview(file);
                                          }
                                        : undefined
                                }
                            >
                                {file.name}
                            </a>
                            <span className="shrink-0 text-xs text-body/70">
                                {formatBytes(file.size)}
                            </span>
                            <OpenInTab href={href} label={file.name} />
                        </li>
                    );
                })}
            </ul>
            {!open && (
                <div
                    aria-hidden="true"
                    className="hidden pointer-events-none absolute inset-0 md:grid place-items-center text-[10px] font-medium uppercase tracking-[0.18em] text-body/60"
                >
                    {/* letter-spacing: 24px;line-height: 22px;rotate: -90deg;left: -56px;position: relative;top: -16px; */}
                    <span className="md:-rotate-90 leading-6 -left-14 relative bottom-2 tracking-[24px]">
                        Files
                    </span>
                </div>
            )}
        </nav>
    );
}
