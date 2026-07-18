/**
 * File-system helpers shared across pilot's core writers.
 *
 * v0.9.7: extracted `atomicWriteFile` so every core
 * writer can use the same tmp-then-rename pattern,
 * rather than each module re-implementing it
 * (and forgetting to — see the audit that found
 * `writePolicy` and `writeWrapper` writing
 * directly to the target file, leaving the file
 * half-written on crash).
 *
 * Why atomic write matters here: pilot's persisted
 * state (policies, wrappers, workflows, snapshots)
 * is parsed on every read. A mid-write corrupt file
 * means the next read fails to parse and the user
 * loses their policy / wrapper / workflow. tmp+rename
 * makes the swap visible to readers as a single
 * instant (the OS rename syscall is atomic on the
 * same filesystem), so readers always see either the
 * old version or the new version — never a partial.
 *
 * Note: this helper is for the simple async write
 * case (the common case in pilot). `settings-write.ts`
 * uses a different sync+`.bak` flow because settings
 * edits need a backup-before-restore path, which is
 * a different semantic; we deliberately do not
 * collapse the two.
 */

import { rename, writeFile, unlink } from "node:fs/promises";

/**
 * Write `content` to `file` atomically: write to
 * `<file>.tmp` first, then `rename` it over the
 * target. On a same-filesystem target the rename
 * is atomic, so a reader never sees a half-written
 * file.
 *
 * If a stale `.tmp` from a prior crash exists, it
 * is removed first so a leftover half-written tmp
 * doesn't confuse a future debug session.
 */
export async function atomicWriteFile(
  file: string,
  content: string,
  encoding: BufferEncoding = "utf-8",
): Promise<void> {
  const tmp = `${file}.tmp`;
  // Best-effort cleanup of a stale tmp from a prior crash.
  // If the file doesn't exist, ENOENT is fine; surface other errors.
  try {
    await unlink(tmp);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  await writeFile(tmp, content, encoding);
  await rename(tmp, file);
}
