import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { filenameTimestamp } from "../../core/time.js";
import type { PageSink } from "./collector.js";
import type { CollectedPage, CollectionResult } from "./types.js";

export class PyaterochkaRawStorage implements PageSink {
  private constructor(public readonly runDirectory: string) {}

  public static async create(
    rawDataDirectory: string,
    storeId: string,
    categoryId: string,
    startedAt: Date,
  ): Promise<PyaterochkaRawStorage> {
    const dateDirectory = startedAt.toISOString().slice(0, 10);
    const runName = `${storeId}_${categoryId}_${filenameTimestamp(startedAt)}`;
    const runDirectory = path.join(rawDataDirectory, dateDirectory, "pyaterochka", runName);
    await mkdir(runDirectory, { recursive: true });
    return new PyaterochkaRawStorage(runDirectory);
  }

  public async writePage(page: CollectedPage): Promise<void> {
    const pageName = rawPageFilename(page);
    await writeJson(path.join(this.runDirectory, pageName), page.envelope);

    const metadata = {
      pageNumber: page.pageNumber,
      offset: page.offset,
      requestedAt: page.requestedAt,
      receivedAt: page.receivedAt,
      durationMs: page.durationMs,
      url: page.url,
      productCount: page.envelope.products.length,
    };
    await writeJson(path.join(this.runDirectory, `${pageName}.meta.json`), metadata);
  }

  public async writeManifest(result: CollectionResult): Promise<string> {
    const manifestPath = path.join(this.runDirectory, "manifest.json");
    await writeJson(manifestPath, {
      chain: "pyaterochka",
      storeId: result.storeId,
      categoryId: result.categoryId,
      startedAt: result.startedAt,
      finishedAt: result.finishedAt,
      pageCount: result.pages.length,
      productCount: result.products.length,
      pageFiles: result.pages.map(
        (page) => rawPageFilename(page),
      ),
    });
    return manifestPath;
  }

  public async writeFailure(error: unknown): Promise<string> {
    const failurePath = path.join(this.runDirectory, "failure.json");
    const details = error instanceof Error
      ? { name: error.name, message: error.message }
      : { name: "UnknownError", message: String(error) };
    await writeJson(failurePath, {
      failedAt: new Date().toISOString(),
      ...details,
    });
    return failurePath;
  }
}

export function rawPageFilename(page: Pick<CollectedPage, "pageNumber" | "offset">): string {
  return `page-${String(page.pageNumber).padStart(4, "0")}` +
    `-offset-${String(page.offset).padStart(6, "0")}.json`;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
