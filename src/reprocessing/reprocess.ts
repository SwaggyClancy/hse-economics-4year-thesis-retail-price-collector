import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { ProductSnapshot } from "../core/product-snapshot.js";
import { logicalDate } from "../core/time.js";
import { normalizeMagnitProduct } from "../normalizers/magnit/normalizer.js";
import { normalizePyaterochkaProduct } from "../normalizers/pyaterochka/normalizer.js";
import { inspectNormalized } from "../quality/inspect.js";
import { MagnitFileState } from "../scheduler/magnit/state.js";
import { loadRawSource } from "./source.js";

export async function reprocessRaw(
  cwd: string, directory: string, write: boolean, timeZone = "Europe/Moscow", stateFile?: string,
): Promise<{ count: number; sourceSha256: string; sourceManifest: string; outputPath: string | null; warnings: readonly string[] }> {
  const source = await loadRawSource(path.resolve(cwd, directory));
  let runStartedAt = source.manifest.startedAt;
  if (stateFile !== undefined) {
    if (source.manifest.chain !== "magnit") throw new Error("--state пока поддержан только для очереди Магнита");
    const state = await new MagnitFileState(path.resolve(cwd, stateFile)).load();
    const matching = state.tasks.filter((task) => task.rawRunDirectory !== null &&
      path.resolve(cwd, task.rawRunDirectory) === source.directory && task.storeId === source.manifest.storeId && task.categoryId === source.manifest.categoryId);
    if (matching.length !== 1) throw new Error("Состояние не содержит выбранный raw-каталог");
    runStartedAt = state.createdAt; timeZone = state.timeZone;
  }
  const date = logicalDate(runStartedAt, timeZone);
  const snapshots: ProductSnapshot[] = [];
  for (const page of source.pages) {
    const context = {
      runStartedAt, collectedAt: page.metadata.receivedAt, logicalDate: date,
      rawReference: path.relative(cwd, path.join(source.directory, page.filename)),
    };
    for (const product of page.products) {
      snapshots.push(source.manifest.chain === "magnit"
        ? normalizeMagnitProduct(product, { ...context, storeCode: source.manifest.storeId, categoryId: Number(source.manifest.categoryId) })
        : normalizePyaterochkaProduct(product, { ...context, storeId: source.manifest.storeId, categoryId: source.manifest.categoryId, categoryName: typeof page.envelope.name === "string" ? page.envelope.name : null }));
    }
  }
  const sourceManifest = path.relative(cwd, path.join(source.directory, "manifest.json"));
  const output = {
    schemaVersion: 1, chain: source.manifest.chain, storeId: source.manifest.storeId,
    categoryId: source.manifest.categoryId, count: snapshots.length, snapshots,
    provenance: { sourceManifest, sourceSha256: source.sha256, runStartedAt, timeZone, reprocessedAt: new Date().toISOString() },
  };
  const check = inspectNormalized("reprocessing", output);
  const errors = check.issues.filter((issue) => issue.severity === "error");
  if (errors.length) throw new Error(`Нормализация не прошла проверку: ${errors.map((error) => error.code).join(", ")}`);
  let outputPath: string | null = null;
  if (write) {
    const target = path.resolve(cwd, "data/normalized", date, source.manifest.chain);
    await mkdir(target, { recursive: true });
    outputPath = path.join(target, `${path.basename(source.directory)}-reprocessed-${randomUUID()}.json`);
    await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, { encoding: "utf8", flag: "wx", flush: true });
  }
  return { count: snapshots.length, sourceSha256: source.sha256, sourceManifest, outputPath, warnings: check.issues.map((issue) => issue.code) };
}
