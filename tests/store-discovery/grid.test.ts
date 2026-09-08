import { describe, expect, it } from "vitest";
import { generateGridPoints, pointInPolygon } from "../../src/store-discovery/pyaterochka/grid.js";

const polygon = [[
  [30, 59] as const,
  [30.02, 59] as const,
  [30.02, 59.02] as const,
  [30, 59.02] as const,
  [30, 59] as const,
]];

describe("pyaterochka discovery grid", () => {
  it("определяет попадание точки в полигон", () => {
    expect(pointInPolygon({ longitude: 30.01, latitude: 59.01 }, polygon)).toBe(true);
    expect(pointInPolygon({ longitude: 31, latitude: 60 }, polygon)).toBe(false);
  });

  it("создаёт детерминированные точки внутри GeoJSON", () => {
    const points = generateGridPoints(
      { type: "Polygon", coordinates: polygon },
      { spacingMeters: 500, shiftFraction: 0.5, level: 1 },
    );
    expect(points.length).toBeGreaterThan(1);
    expect(points.every((point) => pointInPolygon(point, polygon))).toBe(true);
    expect(points[0]?.id).toBe("L1-1");
  });
});
