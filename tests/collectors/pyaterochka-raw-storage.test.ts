import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PyaterochkaRawStorage } from "../../src/collectors/pyaterochka/raw-storage.js";
import type { CollectedPage, CollectionResult } from "../../src/collectors/pyaterochka/types.js";

const temporaryDirectories: string[] = [];

afterEach(async (): Promise<void> => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function makeStorage(): Promise<PyaterochkaRawStorage> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "retail-collector-test-"));
  temporaryDirectories.push(directory);
  return PyaterochkaRawStorage.create(
    directory,
    "324K",
    "251C12891",
    new Date("2026-08-17T18:20:00.991Z"),
  );
}

function collectedPage(): CollectedPage {
  return {
    pageNumber: 1,
    offset: 0,
    requestedAt: "2026-08-17T18:20:00.000Z",
    receivedAt: "2026-08-17T18:20:00.500Z",
    durationMs: 500,
    url: "https://5d.5ka.ru/api/catalog/example?limit=12&offset=0",
    envelope: {
      parent_id: "251C12884",
      name: "Завтраки",
      products: [{ plu: 58625, name: "Тестовый товар" }],
    },
  };
}

describe("PyaterochkaRawStorage", () => {
  it("stores the untouched page envelope separately from request metadata", async () => {
    const storage = await makeStorage();
    const page = collectedPage();

    await storage.writePage(page);

    const rawPage = JSON.parse(
      await readFile(path.join(storage.runDirectory, "page-0001-offset-000000.json"), "utf8"),
    ) as unknown;
    const metadata = JSON.parse(
      await readFile(
        path.join(storage.runDirectory, "page-0001-offset-000000.json.meta.json"),
        "utf8",
      ),
    ) as { productCount: number };
    expect(rawPage).toEqual(page.envelope);
    expect(metadata.productCount).toBe(1);
  });

  it("writes a collection manifest and a machine-readable failure file", async () => {
    const storage = await makeStorage();
    const page = collectedPage();
    const result: CollectionResult = {
      storeId: "324K",
      categoryId: "251C12891",
      startedAt: page.requestedAt,
      finishedAt: page.receivedAt,
      pages: [page],
      products: page.envelope.products,
    };

    const manifestPath = await storage.writeManifest(result);
    const failurePath = await storage.writeFailure(new Error("network unavailable"));
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      pageCount: number;
      productCount: number;
    };
    const failure = JSON.parse(await readFile(failurePath, "utf8")) as {
      name: string;
      message: string;
    };

    expect(manifest).toMatchObject({ pageCount: 1, productCount: 1 });
    expect(failure).toMatchObject({ name: "Error", message: "network unavailable" });
  });
});
