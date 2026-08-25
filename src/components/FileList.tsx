import { Link } from "react-router";
import type { ArtifactFile } from "../lib/artifact";
import { fileUrl, parentPath } from "../lib/artifact";
import { fileIcon, formatBytes } from "../lib/format";
import { cn } from "../lib/utils";
import { ChevronIcon, FolderIcon, ParentFolderIcon } from "./Icons";

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
    id: string;
    subPath: string;
    files: ArtifactFile[];
    directories: string[];
    activeName: string | null;
    onPreview: (file: ArtifactFile) => void;
    open: boolean;
    onToggle: () => void;
}

export function FileList({
    id,
    subPath,
    files,
    directories,
    activeName,
    onPreview,
    open,
    onToggle,
}: FileListProps) {
    const parent = parentPath(subPath);

    return (
        <nav
            aria-label="Files in this artifact"
            className={`${open ? "" : "max-md:h-9 md:w-0 md:overflow-visible"} relative overflow-y-auto border-edge max-md:max-h-[25vh] max-md:border-b md:border-r md:transition-[width] md:duration-200`}
        >
            <button
                type="button"
                aria-label={open ? "Close file list" : "Open file list"}
                aria-expanded={open}
                onClick={onToggle}
                className="absolute right-0 top-2 z-10 grid size-7 translate-x-full place-items-center rounded-r-md border border-l-0 border-edge bg-panel text-sm text-body shadow-sm hover:text-brand md:top-2"
            >
                <ChevronIcon
                    type={open ? "left" : "right"}
                    className="size-3"
                />
            </button>
            <ul
                className={`flex flex-col gap-1 p-2 ${open ? "" : "max-md:hidden md:invisible"}`}
            >
                {parent !== null && (
                    <li className={ROW}>
                        <span aria-hidden="true">
                            <FolderIcon className="size-4" />
                        </span>
                        <Link className={NAME} to={`/a/${id}/${parent}`}>
                            .. (parent directory)
                        </Link>
                    </li>
                )}

                {directories.map((dir) => (
                    <li key={dir} className={ROW}>
                        <ParentFolderIcon className="size-4" />
                        <Link className={NAME} to={`/a/${id}/${subPath}${dir}`}>
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
        </nav>
    );
}
