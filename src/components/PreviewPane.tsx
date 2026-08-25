import { useState } from "react";
import { Button } from "./Button";
import { type ArtifactFile, fileUrl, previewUrl } from "../lib/artifact";
import { ChevronIcon } from "./Icons";
import { cn } from "../lib/utils";

interface PreviewPaneProps {
    id: string;
    subPath: string;
    files: ArtifactFile[];
    selected: ArtifactFile | null;
    sidebarOpen: boolean;
    onToggle: () => void;
}

export function PreviewPane({
    id,
    subPath,
    files,
    selected,
    sidebarOpen,
    onToggle,
}: PreviewPaneProps) {
    const [sourceMode, setSourceMode] = useState<{
        fileName: string;
        showing: boolean;
    } | null>(null);
    const showSource =
        selected !== null &&
        sourceMode?.fileName === selected.name &&
        sourceMode.showing;

    const src =
        selected === null
            ? null
            : showSource
              ? fileUrl(id, subPath, selected.name)
              : previewUrl(id, subPath, selected);

    const placeholder =
        files.length === 0
            ? "This folder only contains subfolders — open one from the list."
            : "No preview available for these files — click one in the list to download it.";

    return (
        <section className="relative flex min-h-0 bg-surface">
            <button
                type="button"
                aria-label={sidebarOpen ? "Close file list" : "Open file list"}
                aria-expanded={sidebarOpen}
                onClick={onToggle}
                className={cn(
                    "absolute left-1/2 top-0 z-10 grid h-4 w-8 -translate-x-1/2 place-items-center rounded-b-md border border-t-0 border-edge bg-panel text-sm text-body shadow-sm transition-colors hover:text-brand md:left-0 md:top-1/2 md:h-8 md:w-4 md:translate-x-0 md:-translate-y-1/2 md:rounded-r-md md:rounded-l-none md:border-l-0 md:border-t",
                    sidebarOpen
                        ? "cursor-n-resize md:cursor-w-resize"
                        : "cursor-s-resize md:cursor-e-resize",
                )}
            >
                <ChevronIcon
                    type={sidebarOpen ? "up" : "down"}
                    className="size-3 md:hidden"
                />
                <ChevronIcon
                    type={sidebarOpen ? "right" : "left"}
                    className="hidden size-3 md:inline-block"
                />
            </button>

            {src === null ? (
                <p className="m-auto max-w-80 p-6 text-center text-body">
                    {placeholder}
                </p>
            ) : (
                <iframe
                    // Keying on the URL makes a re-preview of the same file remount
                    // rather than leaving the previous document up.
                    key={src}
                    title="File preview"
                    src={src}
                    className="flex-1 border-none bg-surface"
                />
            )}

            {selected?.markdown && (
                <Button
                    className="absolute top-3 right-3 bg-surface"
                    onClick={() =>
                        setSourceMode({
                            fileName: selected.name,
                            showing: !showSource,
                        })
                    }
                >
                    {showSource ? "Show rendered" : "Show source"}
                </Button>
            )}
        </section>
    );
}
