import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ProductSnapshot } from "../../core/product-snapshot.js";

export async function writeNormalizedPyaterochkaCollection(
  normalizedDataDirectory: string,
  rawRunDirectory: string,
  snapshots: readonly ProductSnapshot[],
): Promise<string> {
  const date = snapshots[0]?.logicalDate ?? new Date().toISOString().slice(0, 10);
  const directory = path.join(normalizedDataDirectory, date, "pyaterochka");
  const outputPath = path.join(directory, `${path.basename(rawRunDirectory)}.json`);
  await mkdir(directory, { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify({ chain: "pyaterochka", count: snapshots.length, snapshots }, null, 2)}\n`,
    "utf8",
  );
  return outputPath;
}
