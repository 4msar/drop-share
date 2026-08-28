const DELETE_BATCH_SIZE = 1000;

export interface ArtifactChild {
  key: string;
  name: string;
  size: number;
  uploaded: Date;
  contentType?: string;
}

export interface ArtifactListing {
  files: ArtifactChild[];
  directories: string[];
}

/** Lists the immediate children of an artifact (or a subdirectory within it) using R2's prefix+delimiter listing. */
export async function listArtifactChildren(
  bucket: R2Bucket,
  prefix: string,
): Promise<ArtifactListing> {
  const files: ArtifactChild[] = [];
  const directories: string[] = [];
  let cursor: string | undefined;

  do {
    const page = await bucket.list({ prefix, delimiter: "/", cursor, include: ["httpMetadata"] });
    for (const object of page.objects) {
      const name = object.key.slice(prefix.length);
      // Hidden files (dot-prefixed, e.g. the artifact metadata marker) are
      // internal bookkeeping - never part of a public listing.
      if (name.startsWith(".")) continue;
      files.push({
        key: object.key,
        name,
        size: object.size,
        uploaded: object.uploaded,
        contentType: object.httpMetadata?.contentType,
      });
    }
    for (const delimitedPrefix of page.delimitedPrefixes) {
      const name = delimitedPrefix.slice(prefix.length);
      if (name.startsWith(".")) continue;
      directories.push(name);
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  return { files, directories };
}

export interface ArtifactObjectRef {
  key: string;
  size: number;
}

/** Lists every object (key + size) under an artifact id, regardless of nesting - used for delete, existence checks, and total-size accounting. */
export async function listAllArtifactKeys(bucket: R2Bucket, artifactId: string): Promise<ArtifactObjectRef[]> {
  const prefix = `${artifactId}/`;
  const refs: ArtifactObjectRef[] = [];
  let cursor: string | undefined;

  do {
    const page = await bucket.list({ prefix, cursor });
    refs.push(...page.objects.map((object) => ({ key: object.key, size: object.size })));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  return refs;
}

/** Deletes every object belonging to an artifact. The artifact id itself is never reused afterwards. */
export async function deleteArtifact(bucket: R2Bucket, artifactId: string): Promise<number> {
  const refs = await listAllArtifactKeys(bucket, artifactId);
  const keys = refs.map((ref) => ref.key);
  for (let i = 0; i < keys.length; i += DELETE_BATCH_SIZE) {
    await bucket.delete(keys.slice(i, i + DELETE_BATCH_SIZE));
  }
  return keys.length;
}
