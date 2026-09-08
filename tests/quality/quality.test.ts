import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterEach, expect, it } from "vitest";
import { inspectNormalized, compareCounts } from "../../src/quality/inspect.js";
import { buildQualityReport, saveQualityReport } from "../../src/quality/report.js";

const product = {
  chain: "magnit", storeId: "001", categoryId: "100", productId: "1", name: "Товар",
  logicalDate: "2026-09-03", runStartedAt: "2026-09-03T10:00:00.000Z", collectedAt: "2026-09-03T10:00:01.000Z",
  regularPrice: { amountMinor: 10000, currency: "RUB", minorUnitScale: 2 }, discountPrice: null,
  available: true, rawReference: "data/raw/page.json",
};
const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });

function envelope(rows: unknown[]): unknown { return { chain: "magnit", count: rows.length, snapshots: rows }; }

it("accepts valid data", () => {
  expect(inspectNormalized("file", envelope([product])).issues).toEqual([]);
});
it("reports malformed and empty envelopes without crashing", () => {
  expect(inspectNormalized("file", null).issues[0]?.code).toBe("INVALID_ENVELOPE");
  expect(inspectNormalized("file", envelope([])).issues[0]?.code).toBe("EMPTY_CATEGORY");
});
it("checks duplicates and count metadata", () => {
  const result = inspectNormalized("file", { chain: "magnit", count: 1, snapshots: [product, product] });
  expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["COUNT_MISMATCH", "DUPLICATE_PRODUCT"]));
});
it("reports missing prices, invalid money and timestamps", () => {
  const result = inspectNormalized("file", envelope([
    { ...product, regularPrice: null },
    { ...product, productId: "2", regularPrice: { amountMinor: 1.5, currency: "RUB", minorUnitScale: 2 }, collectedAt: "bad" },
  ]));
  expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["MISSING_PRICE", "INVALID_MONEY", "INVALID_TIMESTAMP"]));
});
it("bounds row examples", () => {
  const result = inspectNormalized("file", envelope(Array.from({ length: 40 }, () => ({ ...product, name: "" }))));
  expect(result.issues.find((issue) => issue.code === "MISSING_NAME")).toMatchObject({ count: 40, rows: [1,2,3,4,5,6,7,8,9,10] });
});
it("compares count drops only for matching independent collections", () => {
  const first = inspectNormalized("first", envelope(Array.from({ length: 10 }, (_, index) => ({ ...product, productId: String(index) }))));
  const second = inspectNormalized("second", envelope([{ ...product, runStartedAt: "2026-09-03T10:00:00.500Z" }]));
  compareCounts([second, first]);
  expect(second.issues.map((issue) => issue.code)).toContain("COUNT_DROP_OVER_50_PERCENT");
});
it("does not silently select one of multiple normalizations", () => {
  const files = [inspectNormalized("a", envelope([product])), inspectNormalized("b", envelope([product]))];
  compareCounts(files);
  expect(files.every((file) => file.issues.some((issue) => issue.code === "MULTIPLE_VERSIONS"))).toBe(true);
});
it("handles broken JSON and unsafe raw paths without modifying source files", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "retail-quality-test-")); directories.push(cwd);
  await mkdir(path.join(cwd, "data/normalized"), { recursive: true });
  const source = path.join(cwd, "data/normalized/good.json");
  const body = JSON.stringify(envelope([{ ...product, rawReference: "../private.json" }]));
  await writeFile(source, body);
  await writeFile(path.join(cwd, "data/normalized/broken.json"), "{");
  const report = await buildQualityReport(cwd);
  expect(report.summary.files).toBe(2);
  expect(report.summary.errors).toBe(2);
  const output = await saveQualityReport(cwd, report);
  expect(await readFile(source, "utf8")).toBe(body);
  expect(await readFile(path.join(output, "report.md"), "utf8")).toContain("RAW_OUTSIDE_ROOT");
});
it("does not treat an empty workspace as a proven successful collection", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "retail-quality-test-")); directories.push(cwd);
  const report = await buildQualityReport(cwd);
  expect(report.summary.files).toBe(0);
  expect(report.notes[0]).toContain("не подтверждает");
});
