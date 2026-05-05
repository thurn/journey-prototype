import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

let tempCounter = 0;

function nextTempPath(path: string): string {
  tempCounter += 1;

  return join(dirname(path), `${basename(path)}.tmp-${process.pid}-${tempCounter}`);
}

export async function writeFileAtomic(
  path: string,
  bytes: Uint8Array | string,
): Promise<void> {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true });

  const tempPath = nextTempPath(path);

  try {
    await writeFile(tempPath, bytes);
    await rename(tempPath, path);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}
