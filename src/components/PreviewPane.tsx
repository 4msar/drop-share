import { useEffect, useRef, useState } from "react";
import { Button } from "./Button";
import { type ArtifactFile, fileUrl, previewUrl } from "../lib/artifact";
import { useArtifactState } from "../contexts/useArtifact";
import {
    ChevronIcon,
    CodeIcon,
    EyeIcon,
    FullscreenEnterIcon,
    FullscreenExitIcon,
} from "./Icons";
import { cn } from "../lib/utils";

interface PreviewPaneProps {
    files: ArtifactFile[];
    selected: ArtifactFile | null;
    sidebarOpen: boolean;
    onToggle: () => void;
}

export function PreviewPane({
    files,
    selected,
    sidebarOpen,
    onToggle,
}: PreviewPaneProps) {
    const { id, subPath } = useArtifactState();
    const sectionRef = useRef<HTMLElement | null>(null);
    const [sourceMode, setSourceMode] = useState<{
        fileName: string;
        showing: boolean;
    } | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const showSource =
        selected !== null &&
        sourceMode?.fileName === selected.name &&
        sourceMode.showing;

    useEffect(() => {
        const onFullscreenChange = () => {
            setIsFullscreen(document.fullscreenElement === sectionRef.current);
        };

        document.addEventListener("fullscreenchange", onFullscreenChange);
        return () =>
            document.removeEventListener(
                "fullscreenchange",
                onFullscreenChange,
            );
    }, []);

    const toggleFullscreen = async () => {
        if (!sectionRef.current) {
            return;
        }

        try {
            if (document.fullscreenElement === sectionRef.current) {
                await document.exitFullscreen();
                return;
            }

            await sectionRef.current.requestFullscreen();
        } catch {
            // Ignore browser/runtime fullscreen errors to avoid breaking preview UI.
        }
    };

    const supportFullscreen =
        document.fullscreenEnabled &&
        "requestFullscreen" in HTMLElement.prototype;

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
        <section ref={sectionRef} className="relative flex min-h-0 bg-surface">
            <button
                type="button"
                aria-label={sidebarOpen ? "Close file list" : "Open file list"}
                aria-expanded={sidebarOpen}
                onClick={onToggle}
                className={cn(
                    "absolute left-1/2 top-0 z-10 grid h-5 w-9 -translate-x-1/2 place-items-center rounded-b-md border border-t-0 border-edge bg-panel text-sm text-body shadow-sm transition-colors hover:text-brand md:-left-4 md:top-1/2 md:h-8 md:w-4 md:translate-x-0 md:size-8 md:-translate-y-1/2 md:rounded-full md:border",
                    sidebarOpen
                        ? "cursor-n-resize md:cursor-w-resize"
                        : "cursor-s-resize md:cursor-e-resize",
                )}
            >
                <ChevronIcon
                    type={sidebarOpen ? "up" : "down"}
                    className="size-4 md:hidden"
                />
                <ChevronIcon
                    type={sidebarOpen ? "right" : "left"}
                    className="hidden size-4 md:inline-block"
                />
            </button>

            {src === null ? (
                <p className="m-auto max-w-80 p-6 text-center text-body">
                    {placeholder}
                </p>
            ) : (
                <iframe
                    title="File preview"
                    sandbox="allow-scripts allow-same-origin allow-forms"
                    allow="fullscreen; clipboard-write"
                    allowFullScreen
                    // Keying on the URL makes a re-preview of the same file remount
                    // rather than leaving the previous document up.
                    key={src}
                    src={src}
                    className="flex-1 scrollbar-none border-none bg-surface"
                />
            )}

            {src !== null && (
                <div className="absolute top-3 right-3 flex items-center gap-2">
                    {selected?.markdown && (
                        <Button
                            className="bg-surface p-2"
                            title={showSource ? "Show rendered" : "Show source"}
                            aria-label={
                                showSource ? "Show rendered" : "Show source"
                            }
                            onClick={() =>
                                setSourceMode({
                                    fileName: selected.name,
                                    showing: !showSource,
                                })
                            }
                        >
                            {showSource ? <EyeIcon /> : <CodeIcon />}
                        </Button>
                    )}
                    {supportFullscreen && (
                        <Button
                            className="bg-surface p-2"
                            title={
                                isFullscreen
                                    ? "Exit fullscreen"
                                    : "Enter fullscreen"
                            }
                            onClick={toggleFullscreen}
                        >
                            {isFullscreen ? (
                                <FullscreenExitIcon />
                            ) : (
                                <FullscreenEnterIcon />
                            )}
                        </Button>
                    )}
                </div>
            )}
        </section>
    );
}
