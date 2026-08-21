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
      files.push({
        key: object.key,
        name: object.key.slice(prefix.length),
        size: object.size,
        uploaded: object.uploaded,
        contentType: object.httpMetadata?.contentType,
      });
    }
    for (const delimitedPrefix of page.delimitedPrefixes) {
      directories.push(delimitedPrefix.slice(prefix.length));
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  return { files, directories };
}

/** Lists every object key under an artifact id, regardless of nesting - used for delete and existence checks. */
export async function listAllArtifactKeys(bucket: R2Bucket, artifactId: string): Promise<string[]> {
  const prefix = `${artifactId}/`;
  const keys: string[] = [];
  let cursor: string | undefined;

  do {
    const page = await bucket.list({ prefix, cursor });
    keys.push(...page.objects.map((object) => object.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  return keys;
}

/** Deletes every object belonging to an artifact. The artifact id itself is never reused afterwards. */
export async function deleteArtifact(bucket: R2Bucket, artifactId: string): Promise<number> {
  const keys = await listAllArtifactKeys(bucket, artifactId);
  for (let i = 0; i < keys.length; i += DELETE_BATCH_SIZE) {
    await bucket.delete(keys.slice(i, i + DELETE_BATCH_SIZE));
  }
  return keys.length;
}
