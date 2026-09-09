import { describe, expect, it } from "vitest";
import type { DiscoveryManifest } from "../../src/store-discovery/core/types.js";
import { validateDiscoveryManifest } from "../../src/store-discovery/core/validation.js";

describe("store discovery validation", () => {
  it("подтверждает полный справочник", () => {
    const result = validateDiscoveryManifest(manifest());

    expect(result).toMatchObject({
      valid: true,
      storeCount: 1,
      activeStoreCount: 1,
      administrativeDistrictCoverage: 100,
      municipalDistrictCoverage: 100,
      issues: [],
    });
  });

  it("находит дубли, неверные координаты и пропуски районов", () => {
    const first = manifest().stores[0];
    if (first === undefined) throw new Error("Нет тестового магазина");
    const broken: DiscoveryManifest = {
      ...manifest(),
      uniqueStoreCount: 1,
      stores: [
        { ...first, latitude: 100, administrativeDistrict: null, municipalDistrict: null },
        first,
      ],
    };

    const result = validateDiscoveryManifest(broken);

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "invalid_coordinates",
      "missing_administrative_district",
      "missing_municipal_district",
      "duplicate_code",
      "count_mismatch",
    ]));
  });
});

function manifest(): DiscoveryManifest {
  return {
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
}
