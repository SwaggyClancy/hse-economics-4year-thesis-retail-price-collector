import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { MagnitRawStorage } from "../../src/collectors/magnit/raw-storage.js";
import { writeNormalizedMagnitCollection } from "../../src/normalizers/magnit/storage.js";
import { readCodeList } from "../../src/config/code-list.js";

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

it("persists raw envelope, metadata and failure without removing pages", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "magnit-storage-test-"));
  directories.push(directory);
  const storage = await MagnitRawStorage.create(directory, "011601", 64247, new Date("2026-09-02T18:00:00Z"));
  const envelope = { items: [], pagination: { hasMore: false, offset: 0, limit: 32, totalCount: 0 }, extra: "preserved" };
  await storage.writePage({
    pageNumber: 1, offset: 0, requestedAt: "2026-09-02T18:00:00Z", receivedAt: "2026-09-02T18:00:01Z",
    durationMs: 1000, url: "https://magnit.ru/webgate/v2/goods/search", envelope,
  });
  await storage.writeFailure(new Error("test failure"));
  expect(JSON.parse(await readFile(path.join(storage.runDirectory, "page-0001-offset-000000.json"), "utf8"))).toEqual(envelope);
  expect(JSON.parse(await readFile(path.join(storage.runDirectory, "failure.json"), "utf8")) as unknown).toMatchObject({ message: "test failure" });
});

it("uses the logical run date for an empty normalized collection", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "magnit-normalized-test-"));
  directories.push(directory);
  const output = await writeNormalizedMagnitCollection(directory, "empty-run", [], "2026-09-01T22:00:00Z", "Europe/Moscow");
  expect(output).toContain(path.join("2026-09-02", "magnit"));
  expect(JSON.parse(await readFile(output, "utf8")) as unknown).toMatchObject({ chain: "magnit", count: 0 });
  await expect(writeNormalizedMagnitCollection(directory, "empty-run", [], "2026-09-01T22:00:00Z", "Europe/Moscow")).rejects.toThrow();
});

it("rejects placeholder codes from an unconfigured example file", async () => {
  await expect(readCodeList(path.resolve("config/stores.magnit.example.json"), "magnit")).rejects.toThrow("Код должен");
});
