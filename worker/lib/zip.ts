import { Unzip, UnzipInflate, UnzipPassThrough, type UnzipFile } from "fflate";
import { normalizeRelativePath } from "./paths.js";
import { PayloadTooLargeError, SizeBudget } from "./validation.js";

export class ZipValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZipValidationError";
  }
}

export interface ExtractedFile {
  path: string;
  data: Uint8Array;
}

export interface ExtractLimits {
  maxTotalBytes: number;
  maxEntryCount: number;
}

interface CentralDirectoryEntry {
  name: string;
  compressionMethod: number;
  generalPurposeFlag: number;
  externalAttributes: number;
  versionMadeBy: number;
  uncompressedSize: number;
  isDirectory: boolean;
}

interface PlannedEntry {
  name: string;
  normalizedPath: string;
}

// Only these two methods are used by ordinary zip tools and by fflate's
// streaming decoder; anything else (bzip2, LZMA, ...) is refused up front
// rather than passed to a decompressor that doesn't understand it.
const SUPPORTED_COMPRESSION_METHODS = new Set([0, 8]);
const ENCRYPTED_FLAG_BIT = 0x1;
const UNIX_SYMLINK_MODE_MASK = 0xf000;
const UNIX_SYMLINK_MODE_VALUE = 0xa000;

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const EOCD_FIXED_SIZE = 22;
const MAX_COMMENT_LENGTH = 65535;
const ZIP64_SENTINEL_SIZE = 0xffffffff;

function findEndOfCentralDirectory(bytes: Uint8Array): DataView {
  if (bytes.byteLength < EOCD_FIXED_SIZE) {
    throw new ZipValidationError("Not a valid ZIP file (too small)");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const searchFloor = Math.max(0, bytes.byteLength - EOCD_FIXED_SIZE - MAX_COMMENT_LENGTH);
  for (let offset = bytes.byteLength - EOCD_FIXED_SIZE; offset >= searchFloor; offset--) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) {
      return new DataView(bytes.buffer, bytes.byteOffset + offset, EOCD_FIXED_SIZE);
    }
  }
  throw new ZipValidationError("Not a valid ZIP file (missing end-of-central-directory record)");
}

function parseCentralDirectory(bytes: Uint8Array): CentralDirectoryEntry[] {
  const eocd = findEndOfCentralDirectory(bytes);
  const totalEntries = eocd.getUint16(10, true);
  const centralDirectorySize = eocd.getUint32(12, true);
  const centralDirectoryOffset = eocd.getUint32(16, true);

  if (centralDirectoryOffset + centralDirectorySize > bytes.byteLength) {
    throw new ZipValidationError("Corrupt ZIP central directory");
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder("utf-8");
  const entries: CentralDirectoryEntry[] = [];
  let offset = centralDirectoryOffset;

  for (let i = 0; i < totalEntries; i++) {
    if (offset + 46 > bytes.byteLength || view.getUint32(offset, true) !== CENTRAL_HEADER_SIGNATURE) {
      throw new ZipValidationError("Corrupt ZIP central directory entry");
    }
    const versionMadeBy = view.getUint16(offset + 4, true);
    const generalPurposeFlag = view.getUint16(offset + 8, true);
    const compressionMethod = view.getUint16(offset + 10, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const filenameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const externalAttributes = view.getUint32(offset + 38, true);
    const nameStart = offset + 46;
    if (nameStart + filenameLength + extraLength + commentLength > bytes.byteLength) {
      throw new ZipValidationError("Corrupt ZIP central directory entry");
    }
    const name = decoder.decode(bytes.subarray(nameStart, nameStart + filenameLength));

    entries.push({
      name,
      compressionMethod,
      generalPurposeFlag,
      externalAttributes,
      versionMadeBy,
      uncompressedSize,
      isDirectory: name.endsWith("/"),
    });

    offset = nameStart + filenameLength + extraLength + commentLength;
  }

  return entries;
}

/**
 * Validates every entry structurally before any byte is decompressed:
 * rejects encryption, unsupported compression, unix symlinks, and unsafe
 * paths, and rejects early if the archive's own declared sizes already
 * exceed the limit. This is a cheap first line of defense only - malformed
 * metadata that *understates* the real size is still caught later by the
 * live decompression ceiling in extractZipSafely.
 */
function validateAndPlan(entries: CentralDirectoryEntry[], limits: ExtractLimits): PlannedEntry[] {
  if (entries.length > limits.maxEntryCount) {
    throw new ZipValidationError(
      `ZIP contains ${entries.length} entries, exceeding the ${limits.maxEntryCount} limit`,
    );
  }

  const plan: PlannedEntry[] = [];
  let declaredTotal = 0;

  for (const entry of entries) {
    if (entry.isDirectory) continue;

    if ((entry.generalPurposeFlag & ENCRYPTED_FLAG_BIT) !== 0) {
      throw new ZipValidationError(`ZIP entry "${entry.name}" is encrypted, which is not supported`);
    }
    if (!SUPPORTED_COMPRESSION_METHODS.has(entry.compressionMethod)) {
      throw new ZipValidationError(
        `ZIP entry "${entry.name}" uses unsupported compression method ${entry.compressionMethod}`,
      );
    }

    const versionMadeByHost = entry.versionMadeBy >> 8;
    const isUnixHost = versionMadeByHost === 3;
    if (isUnixHost) {
      const unixMode = entry.externalAttributes >>> 16;
      if ((unixMode & UNIX_SYMLINK_MODE_MASK) === UNIX_SYMLINK_MODE_VALUE) {
        throw new ZipValidationError(`ZIP entry "${entry.name}" is a symlink, which is not supported`);
      }
    }

    const normalizedPath = normalizeRelativePath(entry.name);
    if (normalizedPath === null) {
      throw new ZipValidationError(`ZIP entry "${entry.name}" has an unsafe path`);
    }

    const declaredSize =
      entry.uncompressedSize === ZIP64_SENTINEL_SIZE ? limits.maxTotalBytes + 1 : entry.uncompressedSize;
    declaredTotal += declaredSize;
    if (declaredTotal > limits.maxTotalBytes) {
      throw new PayloadTooLargeError(
        `ZIP declares at least ${declaredTotal} bytes of extracted content, exceeding the ${limits.maxTotalBytes}-byte maximum artifact size`,
      );
    }

    plan.push({ name: entry.name, normalizedPath });
  }

  if (plan.length === 0) {
    throw new ZipValidationError("ZIP contains no extractable files");
  }

  return plan;
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(size);
  let position = 0;
  for (const chunk of chunks) {
    merged.set(chunk, position);
    position += chunk.length;
  }
  return merged;
}

/**
 * Safely extracts a ZIP archive already known to fit within maxTotalBytes as
 * a compressed file. Structural validation (paths, entry count, encryption,
 * symlinks, compression method) happens against the central directory before
 * any decompression is attempted. During decompression, a shared SizeBudget
 * is charged against *actual* decompressed bytes as fflate's streaming
 * decoder produces them - this is what stops a zip bomb, since it does not
 * depend on trusting any size the archive claims about itself.
 */
export async function extractZipSafely(zipBytes: Uint8Array, limits: ExtractLimits): Promise<ExtractedFile[]> {
  const centralEntries = parseCentralDirectory(zipBytes);
  const plan = validateAndPlan(centralEntries, limits);
  const planByName = new Map(plan.map((entry) => [entry.name, entry]));

  const budget = new SizeBudget(limits.maxTotalBytes);
  const results: ExtractedFile[] = [];
  let processedCount = 0;

  const unzip = new Unzip((file: UnzipFile) => {
    const planned = planByName.get(file.name);
    if (!planned) return; // directory marker, or a name the central directory didn't approve

    const chunks: Uint8Array[] = [];
    file.ondata = (err, chunk, final) => {
      if (err) throw err;
      if (chunk && chunk.length) {
        budget.add(chunk.length);
        chunks.push(chunk);
      }
      if (final) {
        results.push({ path: planned.normalizedPath, data: concatChunks(chunks) });
        processedCount++;
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  unzip.register(UnzipPassThrough);

  try {
    unzip.push(zipBytes, true);
  } catch (error) {
    if (error instanceof PayloadTooLargeError || error instanceof ZipValidationError) throw error;
    throw new ZipValidationError("Malformed or corrupt ZIP file");
  }

  if (processedCount !== plan.length) {
    throw new ZipValidationError("ZIP local file headers do not match its central directory");
  }

  return results;
}
