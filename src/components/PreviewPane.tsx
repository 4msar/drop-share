import { Button } from "./Button";

interface PreviewPaneProps {
    /** The iframe's URL, or null when this folder has nothing to preview. */
    src: string | null;
    placeholder: string;
    /** Set only for markdown, which can be shown rendered or as raw source. */
    canToggleSource: boolean;
    showingSource: boolean;
    onToggleSource: () => void;
}

export function PreviewPane({
    src,
    placeholder,
    canToggleSource,
    showingSource,
    onToggleSource,
}: PreviewPaneProps) {
    return (
        <section className="relative flex min-h-0 bg-surface">
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

            {canToggleSource && (
                <Button
                    className="absolute top-3 right-3 bg-surface"
                    onClick={onToggleSource}
                >
                    {showingSource ? "Show rendered" : "Show source"}
                </Button>
            )}
        </section>
    );
}
