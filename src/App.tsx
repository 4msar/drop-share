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

type Status = "idle" | "ready" | "zip-choice" | "uploading" | "success" | "error";

const DIRECTORY_INPUT_PROPS = { webkitdirectory: "true", directory: "true" } as Record<string, string>;

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
        const result = await uploadArtifact(mode, selection.files, setProgress);
        setResultUrl(result.url);
        setStatus("success");
        window.setTimeout(() => {
          window.location.href = result.url;
        }, 900);
      } catch (error) {
        setStatus("error");
        setErrorMessage(error instanceof Error ? error.message : "Upload failed");
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
      void filesFromDataTransfer(event.dataTransfer.items).then(handleSelection);
    },
    [handleSelection],
  );

  const totalSize = selection ? selection.files.reduce((sum, f) => sum + f.file.size, 0) : 0;
  const modeForReady = selection ? pickMode(selection) : null;

  return (
    <main className="page">
      <h1>Artifact Drop</h1>
      <p className="subtitle">Drop a file, ZIP, or folder here</p>

      <div
        className={`dropzone${dragActive ? " drag-active" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        role="button"
        tabIndex={0}
        aria-label="Drop files or a folder here, or activate to choose files"
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            fileInputRef.current?.click();
          }
        }}
      >
        <p className="dropzone-label">Drag &amp; drop here</p>
        <div className="dropzone-actions">
          <button type="button" onClick={() => fileInputRef.current?.click()}>
            Choose Files
          </button>
          <button type="button" onClick={() => folderInputRef.current?.click()}>
            Choose Folder
          </button>
        </div>
        <p className="hint">Maximum file size: 10 MB</p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          const { files } = event.target;
          if (files?.length) handleSelection({ files: filesFromFileList(files), isFolder: false });
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
          if (files?.length) handleSelection({ files: filesFromDirectoryInput(files), isFolder: true });
          event.target.value = "";
        }}
      />

      {selection && status !== "idle" && (
        <section className="selection-summary" aria-live="polite">
          <p className="selection-meta">
            <strong>{selection.files.length}</strong> file{selection.files.length === 1 ? "" : "s"} selected ·{" "}
            {formatBytes(totalSize)}
          </p>

          {status === "zip-choice" && (
            <div className="zip-choice">
              <p>How do you want to upload this ZIP?</p>
              <div className="zip-choice-actions">
                <button type="button" className="primary" onClick={() => startUpload("zip")}>
                  Upload ZIP
                </button>
                <button type="button" onClick={() => startUpload("zip-extract")}>
                  Extract &amp; Browse
                </button>
              </div>
            </div>
          )}

          {status === "ready" && modeForReady && modeForReady !== "zip-choice" && (
            <button type="button" className="primary" onClick={() => startUpload(modeForReady)}>
              Upload
            </button>
          )}

          {status === "uploading" && (
            <div className="progress" role="status">
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              <p>Uploading... {Math.round(progress * 100)}%</p>
            </div>
          )}

          {status === "success" && (
            <div className="success" role="status">
              <p>Upload complete.</p>
              <p>
                <a href={resultUrl}>{resultUrl}</a>
              </p>
            </div>
          )}

          {status === "error" && (
            <div className="error" role="alert">
              <p>{errorMessage}</p>
              <button type="button" onClick={reset}>
                Try again
              </button>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

export default App;
