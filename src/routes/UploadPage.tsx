import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "../components/Button";
import { ProgressBar } from "../components/ProgressBar";
import { RecentDrawer } from "../components/RecentDrawer";
import { UploadIcon } from "../components/UploadIcon";
import { formatBytes } from "../lib/format";
import {
    type Selection,
    type UploadMode,
    filesFromDataTransfer,
    filesFromDirectoryInput,
    filesFromFileList,
    pickMode,
    uploadArtifact,
    validateSelection,
} from "../lib/upload";
import { Footer } from "../components/Footer";

type Status =
    | "idle"
    | "ready"
    | "zip-choice"
    | "uploading"
    | "success"
    | "error";

const DIRECTORY_INPUT_PROPS = {
    webkitdirectory: "true",
    directory: "true",
} as Record<string, string>;

const REDIRECT_DELAY_MS = 900;

export default function UploadPage() {
    const navigate = useNavigate();
    const [status, setStatus] = useState<Status>("idle");
    const [selection, setSelection] = useState<Selection | null>(null);
    const [errorMessage, setErrorMessage] = useState("");
    const [progress, setProgress] = useState(0);
    const [resultUrl, setResultUrl] = useState("");
    const [dragActive, setDragActive] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const folderInputRef = useRef<HTMLInputElement>(null);

    const handleSelection = useCallback((next: Selection) => {
        setSelection(next);
        setResultUrl("");
        const validationError = validateSelection(next);
        if (validationError) {
            setStatus("error");
            setErrorMessage(validationError);
            return;
        }
        setErrorMessage("");
        const mode = pickMode(next);
        setStatus(mode === "zip-choice" ? "zip-choice" : "ready");
    }, []);

    const startUpload = useCallback(
        async (mode: UploadMode) => {
            if (!selection) return;
            setStatus("uploading");
            setProgress(0);
            try {
                const result = await uploadArtifact(
                    mode,
                    selection.files,
                    setProgress,
                );
                setResultUrl(result.url);
                setStatus("success");
                // The viewer is a client route now, so this is an in-app transition
                // rather than a full document load.
                window.setTimeout(
                    () => void navigate(result.url),
                    REDIRECT_DELAY_MS,
                );
            } catch (error) {
                setStatus("error");
                setErrorMessage(
                    error instanceof Error ? error.message : "Upload failed",
                );
            }
        },
        [selection, navigate],
    );

    const reset = useCallback(() => {
        setStatus("idle");
        setSelection(null);
        setErrorMessage("");
        setProgress(0);
        setResultUrl("");
        if (fileInputRef.current) fileInputRef.current.value = "";
        if (folderInputRef.current) folderInputRef.current.value = "";
    }, []);

    const onDrop = useCallback(
        (event: React.DragEvent<HTMLDivElement>) => {
            event.preventDefault();
            setDragActive(false);
            if (status === "uploading") return;
            void filesFromDataTransfer(event.dataTransfer.items).then(
                handleSelection,
            );
        },
        [handleSelection, status],
    );

    const totalSize = selection
        ? selection.files.reduce((sum, f) => sum + f.file.size, 0)
        : 0;
    const modeForReady = selection ? pickMode(selection) : null;

    return (
        <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col border-edge px-5 pt-6 pb-10 text-center md:border-x">
            <header className="mx-auto mb-6 flex w-full max-w-5xl items-center justify-center gap-2">
                <img src="/logo.svg" alt="" className="size-8" />
                <span className="text-[15px] font-semibold tracking-tight text-heading">
                    Drop Share
                </span>
            </header>

            <div
                className={`mx-auto flex min-h-[min(60vh,480px)] w-full max-w-5xl flex-1 items-center justify-center rounded-3xl border-2 p-5 transition-all duration-200 sm:min-h-[min(70vh,640px)] sm:p-8 ${
                    dragActive
                        ? "scale-[1.005] border-solid border-brand bg-brand-soft"
                        : "border-dashed border-edge bg-panel"
                }`}
                onDragOver={(event) => {
                    event.preventDefault();
                    if (status !== "uploading") setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={onDrop}
            >
                {status === "idle" && (
                    <div
                        className="flex max-w-md cursor-pointer flex-col items-center gap-2 rounded-3xl p-3 text-center focus-visible:outline-2 focus-visible:outline-offset-[6px] focus-visible:outline-brand"
                        role="button"
                        tabIndex={0}
                        aria-label="Drop files or a folder here, or activate to choose files"
                        onClick={() => fileInputRef.current?.click()}
                        onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                fileInputRef.current?.click();
                            }
                        }}
                    >
                        <UploadIcon />
                        <h1 className="text-2xl leading-tight font-medium tracking-tight text-heading sm:text-[32px]">
                            Drop files, ZIPs, or folders here
                        </h1>
                        <p className="mb-5 text-body">
                            or choose from your device
                        </p>
                        <div className="flex flex-wrap justify-center gap-3">
                            <Button
                                variant="primary"
                                size="lg"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    fileInputRef.current?.click();
                                }}
                            >
                                Choose Files
                            </Button>
                            <Button
                                size="lg"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    folderInputRef.current?.click();
                                }}
                            >
                                Choose Folder
                            </Button>
                        </div>
                        <p className="mt-5 text-[13px] text-body">
                            Maximum file size: 10 MB
                        </p>
                    </div>
                )}

                {selection && status !== "idle" && (
                    <div
                        className="w-full max-w-md text-center"
                        aria-live="polite"
                    >
                        <p className="mb-5 text-sm text-body">
                            <strong>{selection.files.length}</strong> file
                            {selection.files.length === 1 ? "" : "s"} selected ·{" "}
                            {formatBytes(totalSize)}
                        </p>

                        {status === "zip-choice" && (
                            <div>
                                <p className="mb-4">
                                    How do you want to upload this ZIP?
                                </p>
                                <div className="flex flex-wrap justify-center gap-3">
                                    <Button
                                        variant="primary"
                                        size="lg"
                                        onClick={() => void startUpload("zip")}
                                    >
                                        Upload ZIP
                                    </Button>
                                    <Button
                                        size="lg"
                                        onClick={() =>
                                            void startUpload("zip-extract")
                                        }
                                    >
                                        Extract &amp; Browse
                                    </Button>
                                </div>
                            </div>
                        )}

                        {status === "ready" &&
                            modeForReady &&
                            modeForReady !== "zip-choice" && (
                                <div className="flex flex-col items-center gap-3">
                                    <Button
                                        variant="primary"
                                        size="lg"
                                        onClick={() =>
                                            void startUpload(modeForReady)
                                        }
                                    >
                                        Upload
                                    </Button>
                                    <Button variant="link" onClick={reset}>
                                        Choose different files
                                    </Button>
                                </div>
                            )}

                        {status === "uploading" && (
                            <ProgressBar value={progress} />
                        )}

                        {status === "success" && (
                            <div className="text-heading" role="status">
                                <div
                                    className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-brand text-[22px] text-white"
                                    aria-hidden="true"
                                >
                                    ✓
                                </div>
                                <p>Upload complete.</p>
                                <p>
                                    <a
                                        className="break-all text-brand underline"
                                        href={resultUrl}
                                    >
                                        {resultUrl}
                                    </a>
                                </p>
                                <p className="mt-5 text-[13px] text-body">
                                    Redirecting…
                                </p>
                            </div>
                        )}

                        {status === "error" && (
                            <div className="text-red-500" role="alert">
                                <p>{errorMessage}</p>
                                <Button
                                    size="lg"
                                    className="mt-2"
                                    onClick={reset}
                                >
                                    Try again
                                </Button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                aria-label="Choose files to upload"
                onChange={(event) => {
                    const { files } = event.target;
                    if (files?.length) {
                        handleSelection({
                            files: filesFromFileList(files),
                            isFolder: false,
                        });
                    }
                    event.target.value = "";
                }}
            />
            <input
                ref={folderInputRef}
                type="file"
                multiple
                hidden
                aria-label="Choose a folder to upload"
                {...DIRECTORY_INPUT_PROPS}
                onChange={(event) => {
                    const { files } = event.target;
                    if (files?.length) {
                        handleSelection({
                            files: filesFromDirectoryInput(files),
                            isFolder: true,
                        });
                    }
                    event.target.value = "";
                }}
            />

            <Footer />
            <RecentDrawer />
        </main>
    );
}
