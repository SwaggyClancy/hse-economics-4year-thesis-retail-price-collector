import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterEach, expect, it } from "vitest";
import { reprocessRaw } from "../../src/reprocessing/reprocess.js";
import { loadRawSource } from "../../src/reprocessing/source.js";
import { createMagnitState, MagnitFileState } from "../../src/scheduler/magnit/state.js";

const dirs: string[] = [];
afterEach(async () => { for (const directory of dirs.splice(0)) await rm(directory, { recursive: true, force: true }); });

async function fixture(chain: "magnit" | "pyaterochka" = "magnit"): Promise<{ cwd: string; raw: string }> {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "retail-reprocess-test-")); dirs.push(cwd);
  const raw = path.join(cwd, "data/raw/run"); await mkdir(raw, { recursive: true });
  const page = "page-0001-offset-000000.json";
  await writeFile(path.join(raw, "manifest.json"), JSON.stringify({
    chain, storeCode: "001", storeId: "001", categoryId: chain === "magnit" ? 100 : "100",
    startedAt: "2026-09-03T10:00:00.000Z", finishedAt: "2026-09-03T10:00:02.000Z",
    productCount: 1, pageCount: 1, pageFiles: [page],
  }));
  await writeFile(path.join(raw, page), JSON.stringify(chain === "magnit" ? {
    items: [{ id: "1", name: "Test", price: 12345, quantity: 1 }], pagination: { offset: 0, hasMore: false, totalCount: 1 },
  } : { products: [{ plu: "1", name: "Test", prices: { regular: "123.45", discount: null }, is_available: true }] }));
  await writeFile(path.join(raw, `${page}.meta.json`), JSON.stringify({ pageNumber: 1, offset: 0, productCount: 1, requestedAt: "2026-09-03T10:00:00.000Z", receivedAt: "2026-09-03T10:00:01.000Z" }));
  return { cwd, raw };
}

it.each(["magnit", "pyaterochka"] as const)("reprocesses %s without touching raw files or overwriting versions", async (chain) => {
  const { cwd, raw } = await fixture(chain);
  const original = await loadRawSource(raw);
  const preview = await reprocessRaw(cwd, raw, false);
  expect(preview.outputPath).toBeNull();
  expect(await readdir(path.join(cwd, "data"))).toEqual(["raw"]);
  const first = await reprocessRaw(cwd, raw, true);
  const second = await reprocessRaw(cwd, raw, true);
  expect(first.outputPath).not.toBe(second.outputPath);
  expect(first.count).toBe(1);
  expect((await loadRawSource(raw)).sha256).toBe(original.sha256);
  const value = JSON.parse(await readFile(first.outputPath!, "utf8")) as { snapshots: { regularPrice: { amountMinor: number }; collectedAt: string }[] };
  expect(value.snapshots[0]).toMatchObject({ regularPrice: { amountMinor: 12345 }, collectedAt: "2026-09-03T10:00:01.000Z" });
});

it("rejects missing page metadata", async () => {
  const { cwd, raw } = await fixture();
  await rm(path.join(raw, "page-0001-offset-000000.json.meta.json"));
  await expect(reprocessRaw(cwd, raw, true)).rejects.toThrow();
  expect(await readdir(path.join(cwd, "data"))).toEqual(["raw"]);
});

it("rejects traversal and repeated filenames", async () => {
  const { raw } = await fixture();
  const file = path.join(raw, "manifest.json");
  const manifest = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
  for (const pageFiles of [["../secret.json"], ["page-0001-offset-000000.json", "page-0001-offset-000000.json"]]) {
    await writeFile(file, JSON.stringify({ ...manifest, pageFiles, pageCount: pageFiles.length }));
    await expect(loadRawSource(raw)).rejects.toThrow("имена страниц");
  }
});

it("rejects a raw count mismatch", async () => {
  const { raw } = await fixture(); const file = path.join(raw, "manifest.json");
  const value = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
  await writeFile(file, JSON.stringify({ ...value, productCount: 2 }));
  await expect(loadRawSource(raw)).rejects.toThrow();
});

it("preserves the original queue date when an explicit matching state is supplied", async () => {
  const { cwd, raw } = await fixture();
  const initial = createMagnitState([{ storeId: "001", categoryId: "100" }], "Europe/Moscow");
  const state = { ...initial, createdAt: "2026-09-01T22:00:00.000Z", tasks: initial.tasks.map((task) => ({ ...task, rawRunDirectory: raw })) };
  const file = path.join(cwd, "state.json"); await new MagnitFileState(file).save(state);
  const result = await reprocessRaw(cwd, raw, true, "UTC", file);
  const value = JSON.parse(await readFile(result.outputPath!, "utf8")) as { snapshots: { logicalDate: string }[] };
  expect(value.snapshots[0]?.logicalDate).toBe("2026-09-02");
});
