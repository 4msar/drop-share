import { getContentType } from "../lib/contentType.js";
import { jsonError, jsonOk } from "../lib/http.js";
import { generateArtifactId } from "../lib/ids.js";
import { buildObjectKey, normalizeRelativePath } from "../lib/paths.js";
import { PayloadTooLargeError, SizeBudget, checkFileSize } from "../lib/validation.js";
import { ZipValidationError, extractZipSafely } from "../lib/zip.js";

class UploadValidationError extends Error {}

type UploadMode = "file" | "zip" | "directory" | "zip-extract";

interface Limits {
  maxFileSizeBytes: number;
  maxArtifactSizeBytes: number;
  maxArtifactFileCount: number;
}

// Generous margin over the artifact size cap to account for multipart
// boundaries/headers, so we can reject absurdly large requests before even
// parsing them, without false-rejecting a legitimate near-the-limit upload.
const OVERHEAD_ALLOWANCE_BYTES = 1024 * 1024;

function parseLimits(env: Env): Limits {
  return {
    maxFileSizeBytes: Number(env.MAX_FILE_SIZE_BYTES),
    maxArtifactSizeBytes: Number(env.MAX_ARTIFACT_SIZE_BYTES),
    maxArtifactFileCount: Number(env.MAX_ARTIFACT_FILE_COUNT),
  };
}

export async function handleUpload(request: Request, env: Env): Promise<Response> {
  const limits = parseLimits(env);

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > limits.maxArtifactSizeBytes + OVERHEAD_ALLOWANCE_BYTES) {
    return jsonError(413, `Upload exceeds the ${limits.maxArtifactSizeBytes}-byte maximum artifact size`);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError(400, "Malformed multipart/form-data request");
  }

  const mode = form.get("mode");
  if (mode !== "file" && mode !== "zip" && mode !== "directory" && mode !== "zip-extract") {
    return jsonError(400, 'Invalid or missing "mode" (expected file, zip, directory, or zip-extract)');
  }

  const parts = form.getAll("files").filter((value): value is File => value instanceof File);
  if (parts.length === 0) {
    return jsonError(400, "No files provided");
  }

  try {
    const result = await uploadByMode(mode, parts, limits, env);
    return jsonOk(result);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) return jsonError(413, error.message);
    if (error instanceof ZipValidationError) return jsonError(400, error.message);
    if (error instanceof UploadValidationError) return jsonError(400, error.message);
    console.error("upload failed:", error instanceof Error ? error.message : "unknown error");
    return jsonError(500, "Internal error while processing upload");
  }
}

async function uploadByMode(
  mode: UploadMode,
  parts: File[],
  limits: Limits,
  env: Env,
): Promise<{ id: string; url: string }> {
  switch (mode) {
    case "file":
      return uploadSingleFile(env, parts, limits, false);
    case "zip":
      return uploadSingleFile(env, parts, limits, true);
    case "directory":
      return uploadDirectory(env, parts, limits);
    case "zip-extract":
      return uploadZipExtract(env, parts, limits);
  }
}

async function uploadSingleFile(
  env: Env,
  parts: File[],
  limits: Limits,
  isZip: boolean,
): Promise<{ id: string; url: string }> {
  if (parts.length !== 1) {
    throw new UploadValidationError(`Expected exactly one file for this upload mode, received ${parts.length}`);
  }
  const file = parts[0];
  checkFileSize(file.size, limits.maxFileSizeBytes, file.name);

  const relativePath = normalizeRelativePath(file.name);
  if (relativePath === null) {
    throw new UploadValidationError(`Unsafe or invalid filename: ${file.name}`);
  }

  const id = generateArtifactId();
  const key = buildObjectKey(id, relativePath);
  const contentType = isZip ? "application/zip" : getContentType(relativePath);

  await env.ARTIFACTS_BUCKET.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType },
  });

  return { id, url: `/a/${id}/` };
}

async function uploadDirectory(
  env: Env,
  parts: File[],
  limits: Limits,
): Promise<{ id: string; url: string }> {
  if (parts.length > limits.maxArtifactFileCount) {
    throw new UploadValidationError(
      `Upload contains ${parts.length} files, exceeding the ${limits.maxArtifactFileCount} file limit`,
    );
  }

  const budget = new SizeBudget(limits.maxArtifactSizeBytes);
  const planned: { path: string; file: File }[] = [];
  const seenPaths = new Set<string>();

  for (const file of parts) {
    checkFileSize(file.size, limits.maxFileSizeBytes, file.name);
    budget.add(file.size);

    const relativePath = normalizeRelativePath(file.name);
    if (relativePath === null) {
      throw new UploadValidationError(`Unsafe or invalid path: ${file.name}`);
    }
    if (seenPaths.has(relativePath)) {
      throw new UploadValidationError(`Duplicate path in upload: ${relativePath}`);
    }
    seenPaths.add(relativePath);
    planned.push({ path: relativePath, file });
  }

  const id = generateArtifactId();
  for (const { path, file } of planned) {
    const key = buildObjectKey(id, path);
    await env.ARTIFACTS_BUCKET.put(key, await file.arrayBuffer(), {
      httpMetadata: { contentType: getContentType(path) },
    });
  }

  return { id, url: `/a/${id}/` };
}

async function uploadZipExtract(
  env: Env,
  parts: File[],
  limits: Limits,
): Promise<{ id: string; url: string }> {
  if (parts.length !== 1) {
    throw new UploadValidationError(`Expected exactly one ZIP file, received ${parts.length}`);
  }
  const zipFile = parts[0];
  checkFileSize(zipFile.size, limits.maxFileSizeBytes, zipFile.name);

  const zipBytes = new Uint8Array(await zipFile.arrayBuffer());
  const extracted = await extractZipSafely(zipBytes, {
    maxTotalBytes: limits.maxArtifactSizeBytes,
    maxEntryCount: limits.maxArtifactFileCount,
  });

  const id = generateArtifactId();
  for (const entry of extracted) {
    const key = buildObjectKey(id, entry.path);
    await env.ARTIFACTS_BUCKET.put(key, entry.data, {
      httpMetadata: { contentType: getContentType(entry.path) },
    });
  }

  return { id, url: `/a/${id}/` };
}
