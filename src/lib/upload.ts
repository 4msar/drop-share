import { formatBytes } from "./format";

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_ARTIFACT_SIZE_BYTES = 10 * 1024 * 1024;

export type UploadMode = "file" | "zip" | "directory" | "zip-extract";

export interface SelectedFile {
  file: File;
  relativePath: string;
}

export interface Selection {
  files: SelectedFile[];
  isFolder: boolean;
}

export interface UploadResult {
  id: string;
  url: string;
}

/** Reads a plain <input type="file"> selection: flat files, no folder structure. */
export function filesFromFileList(fileList: FileList): SelectedFile[] {
  const files: SelectedFile[] = [];
  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    if (file) files.push({ file, relativePath: file.name });
  }
  return files;
}

/** Reads a <input type="file" webkitdirectory> selection, preserving relative paths. */
export function filesFromDirectoryInput(fileList: FileList): SelectedFile[] {
  const files: SelectedFile[] = [];
  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    if (!file) continue;
    const withPath = file as File & { webkitRelativePath?: string };
    files.push({ file, relativePath: withPath.webkitRelativePath || file.name });
  }
  return files;
}

function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = [];
    const readBatch = () => {
      reader.readEntries((batch) => {
        if (batch.length === 0) resolve(all);
        else {
          all.push(...batch);
          readBatch();
        }
      }, reject);
    };
    readBatch();
  });
}

function readEntryAsFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

async function walkEntry(entry: FileSystemEntry, path: string, results: SelectedFile[]): Promise<void> {
  if (entry.isFile) {
    const file = await readEntryAsFile(entry as FileSystemFileEntry);
    results.push({ file, relativePath: `${path}${entry.name}` });
  } else if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const children = await readAllEntries(reader);
    for (const child of children) {
      await walkEntry(child, `${path}${entry.name}/`, results);
    }
  }
}

/** Recursively reads dropped files/folders via the entry API, falling back to flat files if unavailable. */
export async function filesFromDataTransfer(items: DataTransferItemList): Promise<Selection> {
  const entries: FileSystemEntry[] = [];
  let sawDirectory = false;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const entry = item?.webkitGetAsEntry?.();
    if (entry) {
      entries.push(entry);
      if (entry.isDirectory) sawDirectory = true;
    }
  }

  if (entries.length === 0) {
    const files: SelectedFile[] = [];
    for (let i = 0; i < items.length; i++) {
      const file = items[i]?.getAsFile();
      if (file) files.push({ file, relativePath: file.name });
    }
    return { files, isFolder: false };
  }

  const results: SelectedFile[] = [];
  for (const entry of entries) {
    await walkEntry(entry, "", results);
  }
  return { files: results, isFolder: sawDirectory };
}

/** Determines the upload mode implied by a selection: a lone .zip needs a user choice, everything else is automatic. */
export function pickMode(selection: Selection): UploadMode | "zip-choice" {
  if (selection.isFolder || selection.files.length > 1) return "directory";
  const name = selection.files[0]?.file.name ?? "";
  if (name.toLowerCase().endsWith(".zip")) return "zip-choice";
  return "file";
}

/** Client-side size validation - fast feedback only; the Worker enforces these limits independently. */
export function validateSelection(selection: Selection): string | null {
  if (selection.files.length === 0) return "No files selected";

  let total = 0;
  for (const { file } of selection.files) {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return `"${file.name}" is ${formatBytes(file.size)}, exceeding the 10 MB maximum file size`;
    }
    total += file.size;
  }
  if (total > MAX_ARTIFACT_SIZE_BYTES) {
    return `Total selection is ${formatBytes(total)}, exceeding the 10 MB maximum artifact size`;
  }
  return null;
}

export function uploadArtifact(
  mode: UploadMode,
  files: SelectedFile[],
  onProgress: (fraction: number) => void,
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.set("mode", mode);
    for (const { file, relativePath } of files) {
      form.append("files", file, relativePath);
    }

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    xhr.responseType = "json";
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      const body = xhr.response as { success: boolean; id?: string; url?: string; error?: string } | null;
      if (xhr.status >= 200 && xhr.status < 300 && body?.success && body.id && body.url) {
        resolve({ id: body.id, url: body.url });
      } else {
        reject(new Error(body?.error || `Upload failed (HTTP ${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(form);
  });
}
