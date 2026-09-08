import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ProductSnapshot } from "../../core/product-snapshot.js";
import { logicalDate } from "../../core/time.js";

export async function writeNormalizedMagnitCollection(
  directory: string,
  rawRunDirectory: string,
  snapshots: readonly ProductSnapshot[],
  startedAt: string,
  timeZone: string,
): Promise<string> {
  const target = path.join(directory, logicalDate(startedAt, timeZone), "magnit");
  await mkdir(target, { recursive: true });
  const output = path.join(target, `${path.basename(rawRunDirectory)}.json`);
  await writeFile(output, `${JSON.stringify({ chain: "magnit", count: snapshots.length, snapshots }, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return output;
}
