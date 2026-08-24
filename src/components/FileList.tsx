import { Link } from "react-router";
import type { ArtifactFile } from "../lib/artifact";
import { fileUrl, parentPath } from "../lib/artifact";
import { fileIcon, formatBytes } from "../lib/format";

const ROW =
  "flex items-center gap-2 rounded-md px-2.5 py-2 hover:bg-brand-soft " +
  "focus-within:bg-brand-soft";
const NAME = "flex-1 break-all text-sm no-underline hover:underline";
const ICON = "w-5 shrink-0 text-center";

/** A small "open in its own tab" affordance, separate from the preview click. */
function OpenInTab({ href, label }: { href: string; label: string }) {
  return (
    <a
      className="grid size-6 shrink-0 place-items-center rounded-sm text-sm text-body/50 no-underline hover:bg-brand-soft hover:text-brand focus-visible:bg-brand-soft focus-visible:text-brand focus-visible:outline-none"
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
}

export function FileList({
  id,
  subPath,
  files,
  directories,
  activeName,
  onPreview,
}: FileListProps) {
  const parent = parentPath(subPath);

  return (
    <nav
      aria-label="Files in this artifact"
      className="overflow-y-auto border-edge max-md:max-h-[25vh] max-md:border-b md:border-r"
    >
      <ul className="flex flex-col gap-1 p-2">
        {parent !== null && (
          <li className={ROW}>
            <span className={ICON} aria-hidden="true">
              ⬆️
            </span>
            <Link className={NAME} to={`/a/${id}/${parent}`}>
              .. (parent directory)
            </Link>
          </li>
        )}

        {directories.map((dir) => (
          <li key={dir} className={ROW}>
            <span className={ICON} aria-hidden="true">
              📁
            </span>
            <Link className={NAME} to={`/a/${id}/${subPath}${dir}`}>
              {dir}
            </Link>
            <OpenInTab href={`/a/${id}/${subPath}${dir}`} label={dir} />
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
              <span className={ICON} aria-hidden="true">
                {fileIcon(file.name)}
              </span>
              <a
                className={`${NAME} ${isActive ? "font-medium text-brand" : ""}`}
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
              <span className="shrink-0 text-xs text-body/70">{formatBytes(file.size)}</span>
              <OpenInTab href={href} label={file.name} />
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
