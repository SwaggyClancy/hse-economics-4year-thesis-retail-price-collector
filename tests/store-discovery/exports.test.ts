import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeDiscoveryExports } from "../../src/store-discovery/core/exports.js";
import type { DiscoveryManifest } from "../../src/store-discovery/core/types.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("store discovery exports", () => {
  it("группирует коды и адреса по обоим уровням районов", async () => {
    const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "store-exports-"));
    temporaryDirectories.push(outputDirectory);
    const manifest: DiscoveryManifest = {
      version: 1,
      chain: "magnit",
      city: "Москва",
      startedAt: "2026-09-01T00:00:00.000Z",
      finishedAt: "2026-09-01T01:00:00.000Z",
      rawRequestCount: 1,
      failedRequestCount: 0,
      uniqueStoreCount: 1,
      stores: [{
        chain: "magnit",
        externalCode: "123456",
        address: "Москва, Тестовая улица, 1",
        latitude: 55.75,
        longitude: 37.62,
        active: true,
        administrativeDistrict: "ЦАО",
        municipalDistrict: "Тверской",
        discoveredAt: "2026-09-01T00:00:00.000Z",
        metadata: {},
      }],
    };

    const result = await writeDiscoveryExports(outputDirectory, manifest);
    const summary = JSON.parse(await readFile(result.districtSummaryPath, "utf8")) as Record<string, unknown>;

    expect(summary).toMatchObject({
      chain: "magnit",
      city: "Москва",
      administrativeDistricts: [{ district: "ЦАО", storeCount: 1 }],
      municipalDistricts: [{ district: "Тверской", storeCount: 1 }],
    });
  });
});
