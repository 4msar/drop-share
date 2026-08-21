const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const ENCODING_LEN = ENCODING.length;
const TIME_LEN = 10;
const RANDOM_LEN = 16;
const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

function encodeTime(now: number): string {
  let mutableNow = now;
  let str = "";
  for (let i = TIME_LEN - 1; i >= 0; i--) {
    const mod = mutableNow % ENCODING_LEN;
    str = ENCODING[mod] + str;
    mutableNow = (mutableNow - mod) / ENCODING_LEN;
  }
  return str;
}

function encodeRandom(): string {
  const bytes = new Uint8Array(RANDOM_LEN);
  crypto.getRandomValues(bytes);
  let str = "";
  for (const byte of bytes) {
    str += ENCODING[byte % ENCODING_LEN];
  }
  return str;
}

/** Generates a unique, sortable, immutable artifact identifier (ULID). */
export function generateArtifactId(): string {
  return encodeTime(Date.now()) + encodeRandom();
}

/** Validates that a string is a well-formed artifact id before it is used as an R2 key prefix. */
export function isValidArtifactId(id: string): boolean {
  return ULID_PATTERN.test(id);
}
