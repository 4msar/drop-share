import { sep } from "node:path";

/**
 * Assigns each path a short, unique, flat name for bundling loose files
 * into one artifact. Starts from the bare filename and, only while any
 * name collides, grows every name by one more path segment (so unrelated
 * files can end up with a longer name than strictly necessary, but the
 * whole batch stays uniform and collision-free).
 */
export function disambiguateNames(absolutePaths: string[]): string[] {
  const segmentsList = absolutePaths.map((path) => path.split(sep).filter(Boolean));
  const maxSegments = Math.max(...segmentsList.map((segments) => segments.length));

  for (let tail = 1; tail <= maxSegments; tail++) {
    const candidates = segmentsList.map((segments) => segments.slice(-tail).join("-"));
    if (new Set(candidates).size === candidates.length) {
      return candidates;
    }
  }
  // Absolute paths are always distinct, so appending each one's index
  // guarantees uniqueness even in the (pathological) case where every
  // segment-based candidate above still collided.
  return segmentsList.map((segments, i) => `${segments.join("-")}-${i}`);
}
