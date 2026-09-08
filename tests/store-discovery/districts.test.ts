import { describe, expect, it } from "vitest";
import { assignDistricts, parseDistrictFeatureCollection } from "../../src/store-discovery/core/districts.js";
import type { DiscoveredStore } from "../../src/store-discovery/core/types.js";

describe("store district assignment", () => {
  it("назначает район по координатам", () => {
    const collection = parseDistrictFeatureCollection({
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        properties: { name: "Невский район" },
        geometry: {
          type: "Polygon",
          coordinates: [[[30, 59], [31, 59], [31, 60], [30, 60], [30, 59]]],
        },
      }],
    });
    const result = assignDistricts([store], collection, null);
    expect(result[0]?.administrativeDistrict).toBe("Невский район");
  });
});

const store: DiscoveredStore = {
  chain: "magnit",
  externalCode: "1",
  address: "Адрес",
  latitude: 59.5,
  longitude: 30.5,
  active: true,
  administrativeDistrict: null,
  municipalDistrict: null,
  discoveredAt: "2026-09-01T00:00:00.000Z",
  metadata: {},
};
