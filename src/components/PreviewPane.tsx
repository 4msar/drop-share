import { useState } from "react";
import { Button } from "./Button";
import { type ArtifactFile, fileUrl, previewUrl } from "../lib/artifact";
import { ChevronIcon } from "./Icons";

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
                className="absolute left-0 inset-y-0 z-10 my-auto grid h-8 w-4 place-items-center rounded-r-md border border-l-0 border-edge bg-panel text-sm text-body shadow-sm transition-colors hover:text-brand"
            >
                <ChevronIcon
                    type={sidebarOpen ? "right" : "left"}
                    className="size-3"
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
