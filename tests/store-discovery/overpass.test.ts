import { describe, expect, it } from "vitest";
import { convertOverpassRelations, stitchRings } from "../../src/store-discovery/geography/overpass.js";

describe("Overpass boundary conversion", () => {
  it("соединяет части границы независимо от направления", () => {
    const rings = stitchRings([
      [[0, 0], [1, 0]],
      [[1, 1], [0, 1]],
      [[1, 0], [1, 1]],
      [[0, 0], [0, 1]],
    ]);
    expect(rings).toHaveLength(1);
    expect(rings[0]?.[0]).toEqual(rings[0]?.at(-1));
  });

  it("создаёт GeoJSON FeatureCollection с названием района", () => {
    const result = convertOverpassRelations({
      elements: [{
        type: "relation",
        id: 10,
        tags: { name: "Тестовый район", admin_level: "8" },
        members: [{
          type: "way",
          role: "outer",
          geometry: [
            { lat: 0, lon: 0 },
            { lat: 0, lon: 1 },
            { lat: 1, lon: 1 },
            { lat: 1, lon: 0 },
            { lat: 0, lon: 0 },
          ],
        }],
      }],
    });
    expect(result.features[0]?.properties.name).toBe("Тестовый район");
    expect(result.features[0]?.geometry.type).toBe("MultiPolygon");
  });
});
