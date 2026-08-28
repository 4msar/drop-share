import {
  createArtifactMetadata,
  deriveArtifactLabel,
  loadArtifactAuth,
  metadataObjectKey,
  serializeArtifactMetadata,
} from "../lib/artifactMeta.js";
import { getContentType } from "../lib/contentType.js";
import { jsonError, jsonOk } from "../lib/http.js";
import { generateArtifactId, isValidArtifactId } from "../lib/ids.js";
import { buildObjectKey, normalizeRelativePath } from "../lib/paths.js";
import { listAllArtifactKeys } from "../lib/r2.js";
import { PayloadTooLargeError, SizeBudget, checkFileSize } from "../lib/validation.js";
import { ZipValidationError, extractZipSafely } from "../lib/zip.js";

const METADATA_CONTENT_TYPE = "application/json; charset=utf-8";

class UploadValidationError extends Error {}
class ArtifactNotFoundError extends Error {}

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

  const rawId = form.get("id");
  let existingId: string | undefined;
  if (typeof rawId === "string" && rawId.length > 0) {
    if (!isValidArtifactId(rawId)) {
      return jsonError(400, "Invalid artifact id");
    }
    existingId = rawId;
  }

  if (existingId) {
    const token = request.headers.get("X-Artifact-Token");
    const auth = await loadArtifactAuth(env.ARTIFACTS_BUCKET, existingId, token);
    if (!auth.auth.canModify) return jsonError(403, "Forbidden");
  }

  const parts = form.getAll("files").filter((value): value is File => value instanceof File);
  if (parts.length === 0) {
    return jsonError(400, "No files provided");
  }

  try {
    const result = await uploadByMode(mode, parts, limits, env, existingId);
    return jsonOk(result);
  } catch (error) {
    if (error instanceof ArtifactNotFoundError) return jsonError(404, error.message);
    if (error instanceof PayloadTooLargeError) return jsonError(413, error.message);
    if (error instanceof ZipValidationError) return jsonError(400, error.message);
    if (error instanceof UploadValidationError) return jsonError(400, error.message);
    console.error("upload failed:", error instanceof Error ? error.message : "unknown error");
    return jsonError(500, "Internal error while processing upload");
  }
}

/**
 * Loads the size/count of an existing artifact's objects, excluding any
 * relative paths this batch is about to overwrite (so combining it with the
 * new batch's totals doesn't double-count overwritten files). Returns null
 * if the artifact doesn't exist at all.
 */
async function loadExistingArtifact(
  bucket: R2Bucket,
  artifactId: string,
  excludePaths: Set<string>,
): Promise<{ totalSize: number; fileCount: number } | null> {
  const refs = await listAllArtifactKeys(bucket, artifactId);
  if (refs.length === 0) return null;

  const prefix = `${artifactId}/`;
  let totalSize = 0;
  let fileCount = 0;
  for (const ref of refs) {
    const relativePath = ref.key.slice(prefix.length);
    if (excludePaths.has(relativePath)) continue;
    totalSize += ref.size;
    fileCount += 1;
  }
  return { totalSize, fileCount };
}

async function uploadByMode(
  mode: UploadMode,
  parts: File[],
  limits: Limits,
  env: Env,
  existingId: string | undefined,
): Promise<{ id: string; url: string }> {
  switch (mode) {
    case "file":
      return uploadSingleFile(env, parts, limits, false, existingId);
    case "zip":
      return uploadSingleFile(env, parts, limits, true, existingId);
    case "directory":
      return uploadDirectory(env, parts, limits, existingId);
    case "zip-extract":
      return uploadZipExtract(env, parts, limits, existingId);
  }
}

async function uploadSingleFile(
  env: Env,
  parts: File[],
  limits: Limits,
  isZip: boolean,
  existingId: string | undefined,
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

  const id = existingId ?? generateArtifactId();
  let metadataBody: string | null = null;

  if (existingId) {
    const existing = await loadExistingArtifact(env.ARTIFACTS_BUCKET, existingId, new Set([relativePath]));
    if (existing === null) {
      throw new ArtifactNotFoundError(`Artifact not found: ${existingId}`);
    }
    if (existing.fileCount + 1 > limits.maxArtifactFileCount) {
      throw new UploadValidationError(
        `Artifact would contain ${existing.fileCount + 1} files, exceeding the ${limits.maxArtifactFileCount} file limit`,
      );
    }
    const budget = new SizeBudget(limits.maxArtifactSizeBytes);
    budget.add(existing.totalSize);
    budget.add(file.size);
  } else {
    // A brand-new artifact also gets a hidden `.artifact.json` marker, which
    // counts toward the same limits as any other object in it. The label is
    // just the uploaded file's own name - there's nothing else to derive it
    // from with only one file.
    metadataBody = serializeArtifactMetadata(createArtifactMetadata(relativePath));
    const metadataBytes = new TextEncoder().encode(metadataBody).length;
    const totalFileCount = 2;
    if (totalFileCount > limits.maxArtifactFileCount) {
      throw new UploadValidationError(
        `Artifact would contain ${totalFileCount} files, exceeding the ${limits.maxArtifactFileCount} file limit`,
      );
    }
    if (file.size + metadataBytes > limits.maxArtifactSizeBytes) {
      throw new PayloadTooLargeError(
        `Total artifact size would be ${file.size + metadataBytes} bytes, exceeding the ${limits.maxArtifactSizeBytes}-byte maximum`,
      );
    }
  }

  const key = buildObjectKey(id, relativePath);
  const contentType = isZip ? "application/zip" : getContentType(relativePath);

  await env.ARTIFACTS_BUCKET.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType },
  });

  if (metadataBody !== null) {
    await env.ARTIFACTS_BUCKET.put(metadataObjectKey(id), metadataBody, {
      httpMetadata: { contentType: METADATA_CONTENT_TYPE },
    });
  }

  return { id, url: `/a/${id}/` };
}

async function uploadDirectory(
  env: Env,
  parts: File[],
  limits: Limits,
  existingId: string | undefined,
): Promise<{ id: string; url: string }> {
  if (parts.length > limits.maxArtifactFileCount) {
    throw new UploadValidationError(
      `Upload contains ${parts.length} files, exceeding the ${limits.maxArtifactFileCount} file limit`,
    );
  }

  const planned: { path: string; file: File }[] = [];
  const seenPaths = new Set<string>();

  for (const file of parts) {
    checkFileSize(file.size, limits.maxFileSizeBytes, file.name);

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

  const id = existingId ?? generateArtifactId();
  const budget = new SizeBudget(limits.maxArtifactSizeBytes);
  let fileCount = planned.length;
  let metadataBody: string | null = null;

  if (existingId) {
    const existing = await loadExistingArtifact(env.ARTIFACTS_BUCKET, existingId, seenPaths);
    if (existing === null) {
      throw new ArtifactNotFoundError(`Artifact not found: ${existingId}`);
    }
    fileCount += existing.fileCount;
    budget.add(existing.totalSize);
  } else {
    // Labels the artifact after its common top-level folder when there is
    // one (the typical drag-a-folder case), or a file count otherwise.
    const label = deriveArtifactLabel(planned.map(({ path }) => path));
    metadataBody = serializeArtifactMetadata(createArtifactMetadata(label));
    fileCount += 1;
  }

  if (fileCount > limits.maxArtifactFileCount) {
    throw new UploadValidationError(
      `Artifact would contain ${fileCount} files, exceeding the ${limits.maxArtifactFileCount} file limit`,
    );
  }

  for (const { file } of planned) {
    budget.add(file.size);
  }
  if (metadataBody !== null) {
    budget.add(new TextEncoder().encode(metadataBody).length);
  }

  for (const { path, file } of planned) {
    const key = buildObjectKey(id, path);
    await env.ARTIFACTS_BUCKET.put(key, await file.arrayBuffer(), {
      httpMetadata: { contentType: getContentType(path) },
    });
  }

  if (metadataBody !== null) {
    await env.ARTIFACTS_BUCKET.put(metadataObjectKey(id), metadataBody, {
      httpMetadata: { contentType: METADATA_CONTENT_TYPE },
    });
  }

  return { id, url: `/a/${id}/` };
}

async function uploadZipExtract(
  env: Env,
  parts: File[],
  limits: Limits,
  existingId: string | undefined,
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

  const id = existingId ?? generateArtifactId();
  let metadataBody: string | null = null;

  if (existingId) {
    const extractedPaths = new Set(extracted.map((entry) => entry.path));
    const existing = await loadExistingArtifact(env.ARTIFACTS_BUCKET, existingId, extractedPaths);
    if (existing === null) {
      throw new ArtifactNotFoundError(`Artifact not found: ${existingId}`);
    }
    const combinedFileCount = existing.fileCount + extracted.length;
    if (combinedFileCount > limits.maxArtifactFileCount) {
      throw new UploadValidationError(
        `Artifact would contain ${combinedFileCount} files, exceeding the ${limits.maxArtifactFileCount} file limit`,
      );
    }
    const budget = new SizeBudget(limits.maxArtifactSizeBytes);
    budget.add(existing.totalSize);
    for (const entry of extracted) {
      budget.add(entry.data.byteLength);
    }
  } else {
    // Labeled after the archive itself rather than its extracted paths -
    // the thing the user actually uploaded was one ZIP.
    const label = zipFile.name.replace(/\.zip$/i, "");
    metadataBody = serializeArtifactMetadata(createArtifactMetadata(label));
    const metadataBytes = new TextEncoder().encode(metadataBody).length;
    const combinedFileCount = extracted.length + 1;
    if (combinedFileCount > limits.maxArtifactFileCount) {
      throw new UploadValidationError(
        `Artifact would contain ${combinedFileCount} files, exceeding the ${limits.maxArtifactFileCount} file limit`,
      );
    }
    const budget = new SizeBudget(limits.maxArtifactSizeBytes);
    for (const entry of extracted) {
      budget.add(entry.data.byteLength);
    }
    budget.add(metadataBytes);
  }

  for (const entry of extracted) {
    const key = buildObjectKey(id, entry.path);
    await env.ARTIFACTS_BUCKET.put(key, entry.data, {
      httpMetadata: { contentType: getContentType(entry.path) },
    });
  }

  if (metadataBody !== null) {
    await env.ARTIFACTS_BUCKET.put(metadataObjectKey(id), metadataBody, {
      httpMetadata: { contentType: METADATA_CONTENT_TYPE },
    });
  }

  return { id, url: `/a/${id}/` };
}
