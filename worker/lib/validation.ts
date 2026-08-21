export class PayloadTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayloadTooLargeError";
  }
}

/** Throws PayloadTooLargeError if a single file exceeds the configured maximum. */
export function checkFileSize(size: number, maxFileSizeBytes: number, filename: string): void {
  if (size > maxFileSizeBytes) {
    throw new PayloadTooLargeError(
      `"${filename}" is ${size} bytes, exceeding the ${maxFileSizeBytes}-byte maximum file size`,
    );
  }
}

/**
 * Tracks a running total against a hard ceiling, used both for folder/zip
 * upload total-size checks and for the zip-bomb defense during extraction
 * (where the ceiling is enforced against actual decompressed bytes produced,
 * not against sizes declared in ZIP metadata).
 */
export class SizeBudget {
  #used = 0;
  readonly max: number;

  constructor(maxBytes: number) {
    this.max = maxBytes;
  }

  get used(): number {
    return this.#used;
  }

  /** Adds `size` bytes to the running total; throws without applying it if the budget would be exceeded. */
  add(size: number): void {
    const next = this.#used + size;
    if (next > this.max) {
      throw new PayloadTooLargeError(
        `Total artifact size would be ${next} bytes, exceeding the ${this.max}-byte maximum`,
      );
    }
    this.#used = next;
  }
}
