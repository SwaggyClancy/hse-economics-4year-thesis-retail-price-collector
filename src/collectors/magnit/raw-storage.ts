import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { filenameTimestamp } from "../../core/time.js";
import type { MagnitPageSink } from "./collector.js";
import type { MagnitCollectedPage, MagnitCollectionResult } from "./types.js";

export class MagnitRawStorage implements MagnitPageSink {
  private constructor(public readonly runDirectory: string) {}

  public static async create(
    rawDataDirectory: string,
    storeCode: string,
    categoryId: number,
    startedAt: Date,
  ): Promise<MagnitRawStorage> {
    const dateDirectory = startedAt.toISOString().slice(0, 10);
    const runName = `${storeCode}_${categoryId}_${filenameTimestamp(startedAt)}`;
    const runDirectory = path.join(rawDataDirectory, dateDirectory, "magnit", runName);
    await mkdir(runDirectory, { recursive: true });
    return new MagnitRawStorage(runDirectory);
  }

  public async writePage(page: MagnitCollectedPage): Promise<void> {
    const pageName = magnitRawPageFilename(page);
    await writeJson(path.join(this.runDirectory, pageName), page.envelope);
    await writeJson(path.join(this.runDirectory, `${pageName}.meta.json`), {
      pageNumber: page.pageNumber,
      offset: page.offset,
      requestedAt: page.requestedAt,
      receivedAt: page.receivedAt,
      durationMs: page.durationMs,
      url: page.url,
      productCount: page.envelope.items.length,
      totalCount: page.envelope.pagination.totalCount,
    });
  }

  public async writeManifest(result: MagnitCollectionResult): Promise<string> {
    const manifestPath = path.join(this.runDirectory, "manifest.json");
    await writeJson(manifestPath, {
      chain: "magnit",
      storeCode: result.storeCode,
      categoryId: result.categoryId,
      startedAt: result.startedAt,
      finishedAt: result.finishedAt,
      pageCount: result.pages.length,
      productCount: result.products.length,
      pageFiles: result.pages.map(magnitRawPageFilename),
    });
    return manifestPath;
  }

  public async writeFailure(error: unknown): Promise<string> {
    const failurePath = path.join(this.runDirectory, "failure.json");
    const details = error instanceof Error
      ? { name: error.name, message: error.message }
      : { name: "UnknownError", message: String(error) };
    await writeJson(failurePath, { failedAt: new Date().toISOString(), ...details });
    return failurePath;
  }
}

export function magnitRawPageFilename(
  page: Pick<MagnitCollectedPage, "pageNumber" | "offset">,
): string {
  return `page-${String(page.pageNumber).padStart(4, "0")}` +
    `-offset-${String(page.offset).padStart(6, "0")}.json`;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
