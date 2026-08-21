import { useCallback, useRef, useState } from "react";
import "./App.css";
import {
    type Selection,
    type UploadMode,
    filesFromDataTransfer,
    filesFromDirectoryInput,
    filesFromFileList,
    formatBytes,
    pickMode,
    uploadArtifact,
    validateSelection,
} from "./upload";

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

function UploadIcon() {
    return (
        <svg
            className="drop-icon"
            width="72"
            height="72"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
        >
            <path
                d="M7 18a4.5 4.5 0 0 1-.4-8.98A5.5 5.5 0 0 1 17.5 8a4 4 0 0 1 .5 7.98"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path
                d="M12 20v-7.5m0 0-3 3m3-3 3 3"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function App() {
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
                window.setTimeout(() => {
                    window.location.href = result.url;
                }, 900);
            } catch (error) {
                setStatus("error");
                setErrorMessage(
                    error instanceof Error ? error.message : "Upload failed",
                );
            }
        },
        [selection],
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
        <main className="page">
            <header className="topbar">
                <img src="/logo.svg" alt="Drop Share Logo" className="logo" />
                <span className="brand">Drop Share</span>
            </header>

            <div
                className={`drop-panel${dragActive ? " drag-active" : ""}`}
                onDragOver={(event) => {
                    event.preventDefault();
                    if (status !== "uploading") setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={onDrop}
            >
                {status === "idle" && (
                    <div
                        className="drop-idle"
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
                        <h1>Drop files, ZIPs, or folders here</h1>
                        <p className="drop-subtitle">
                            or choose from your device
                        </p>
                        <div className="drop-actions">
                            <button
                                type="button"
                                className="primary large"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    fileInputRef.current?.click();
                                }}
                            >
                                Choose Files
                            </button>
                            <button
                                type="button"
                                className="large"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    folderInputRef.current?.click();
                                }}
                            >
                                Choose Folder
                            </button>
                        </div>
                        <p className="hint">Maximum file size: 10 MB</p>
                    </div>
                )}

                {selection && status !== "idle" && (
                    <div className="drop-status" aria-live="polite">
                        <p className="selection-meta">
                            <strong>{selection.files.length}</strong> file
                            {selection.files.length === 1 ? "" : "s"} selected ·{" "}
                            {formatBytes(totalSize)}
                        </p>

                        {status === "zip-choice" && (
                            <div className="zip-choice">
                                <p>How do you want to upload this ZIP?</p>
                                <div className="zip-choice-actions">
                                    <button
                                        type="button"
                                        className="primary large"
                                        onClick={() => startUpload("zip")}
                                    >
                                        Upload ZIP
                                    </button>
                                    <button
                                        type="button"
                                        className="large"
                                        onClick={() =>
                                            startUpload("zip-extract")
                                        }
                                    >
                                        Extract &amp; Browse
                                    </button>
                                </div>
                            </div>
                        )}

                        {status === "ready" &&
                            modeForReady &&
                            modeForReady !== "zip-choice" && (
                                <div className="ready-actions">
                                    <button
                                        type="button"
                                        className="primary large"
                                        onClick={() =>
                                            startUpload(modeForReady)
                                        }
                                    >
                                        Upload
                                    </button>
                                    <button
                                        type="button"
                                        className="link"
                                        onClick={reset}
                                    >
                                        Choose different files
                                    </button>
                                </div>
                            )}

                        {status === "uploading" && (
                            <div className="progress" role="status">
                                <div className="progress-track">
                                    <div
                                        className="progress-fill"
                                        style={{
                                            width: `${Math.round(progress * 100)}%`,
                                        }}
                                    />
                                </div>
                                <p>
                                    Uploading... {Math.round(progress * 100)}%
                                </p>
                            </div>
                        )}

                        {status === "success" && (
                            <div className="success" role="status">
                                <div
                                    className="success-icon"
                                    aria-hidden="true"
                                >
                                    ✓
                                </div>
                                <p>Upload complete.</p>
                                <p>
                                    <a href={resultUrl}>{resultUrl}</a>
                                </p>
                                <p className="hint">Redirecting...</p>
                            </div>
                        )}

                        {status === "error" && (
                            <div className="error" role="alert">
                                <p>{errorMessage}</p>
                                <button
                                    type="button"
                                    className="large"
                                    onClick={reset}
                                >
                                    Try again
                                </button>
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
                onChange={(event) => {
                    const { files } = event.target;
                    if (files?.length)
                        handleSelection({
                            files: filesFromFileList(files),
                            isFolder: false,
                        });
                    event.target.value = "";
                }}
            />
            <input
                ref={folderInputRef}
                type="file"
                multiple
                hidden
                {...DIRECTORY_INPUT_PROPS}
                onChange={(event) => {
                    const { files } = event.target;
                    if (files?.length)
                        handleSelection({
                            files: filesFromDirectoryInput(files),
                            isFolder: true,
                        });
                    event.target.value = "";
                }}
            />

            <footer className="footer">
                <p className="footer-text">
                    <a
                        title="Made with ❤️ by msar.dev"
                        href="https://msar.dev"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        msar
                    </a>
                    |
                    <a
                        title="View source on GitHub"
                        href="https://github.com/4msar/drop-share"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        github
                    </a>
                </p>
            </footer>
        </main>
    );
}

export default App;
