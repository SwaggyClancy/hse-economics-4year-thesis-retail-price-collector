import type { Coordinates } from "../core/types.js";
import type { DiscoveryPoint } from "./types.js";

type LinearRing = readonly (readonly [number, number])[];
type PolygonCoordinates = readonly LinearRing[];

export interface GeoJsonGeometry {
  readonly type: "Polygon" | "MultiPolygon";
  readonly coordinates: PolygonCoordinates | readonly PolygonCoordinates[];
}

export interface GridOptions {
  readonly spacingMeters: number;
  readonly shiftFraction: number;
  readonly level: number;
}

export function generateGridPoints(
  geometry: GeoJsonGeometry,
  options: GridOptions,
): readonly DiscoveryPoint[] {
  if (options.spacingMeters <= 0) throw new Error("spacingMeters должен быть больше нуля");
  if (options.shiftFraction < 0 || options.shiftFraction >= 1) {
    throw new Error("shiftFraction должен находиться в диапазоне [0, 1)");
  }
  const polygons = geometry.type === "Polygon"
    ? [geometry.coordinates as PolygonCoordinates]
    : geometry.coordinates as readonly PolygonCoordinates[];
  const bounds = findBounds(polygons);
  const centerLatitude = (bounds.minimumLatitude + bounds.maximumLatitude) / 2;
  const latitudeStep = options.spacingMeters / 111_320;
  const longitudeStep = options.spacingMeters / (111_320 * Math.cos(centerLatitude * Math.PI / 180));
  const latitudeStart = bounds.minimumLatitude + latitudeStep * options.shiftFraction;
  const longitudeStart = bounds.minimumLongitude + longitudeStep * options.shiftFraction;
  const points: DiscoveryPoint[] = [];

  for (let latitude = latitudeStart; latitude <= bounds.maximumLatitude; latitude += latitudeStep) {
    for (let longitude = longitudeStart; longitude <= bounds.maximumLongitude; longitude += longitudeStep) {
      const point = { latitude, longitude };
      if (!polygons.some((polygon) => pointInPolygon(point, polygon))) continue;
      points.push({
        id: `L${options.level}-${points.length + 1}`,
        level: options.level,
        latitude: roundCoordinate(latitude),
        longitude: roundCoordinate(longitude),
      });
    }
  }
  return points;
}

export function pointInPolygon(point: Coordinates, polygon: PolygonCoordinates): boolean {
  const outer = polygon[0];
  if (outer === undefined || !pointInRing(point, outer)) return false;
  return !polygon.slice(1).some((hole) => pointInRing(point, hole));
}

function pointInRing(point: Coordinates, ring: LinearRing): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const currentPoint = ring[index];
    const previousPoint = ring[previous];
    if (currentPoint === undefined || previousPoint === undefined) continue;
    const [currentLongitude, currentLatitude] = currentPoint;
    const [previousLongitude, previousLatitude] = previousPoint;
    const crosses = (currentLatitude > point.latitude) !== (previousLatitude > point.latitude) &&
      point.longitude < (previousLongitude - currentLongitude) *
        (point.latitude - currentLatitude) / (previousLatitude - currentLatitude) + currentLongitude;
    if (crosses) inside = !inside;
  }
  return inside;
}

function findBounds(polygons: readonly PolygonCoordinates[]): {
  minimumLatitude: number;
  maximumLatitude: number;
  minimumLongitude: number;
  maximumLongitude: number;
} {
  const coordinates = polygons.flatMap((polygon) => polygon.flatMap((ring) => ring));
  if (coordinates.length === 0) throw new Error("GeoJSON не содержит координат");
  const longitudes = coordinates.map(([longitude]) => longitude);
  const latitudes = coordinates.map(([, latitude]) => latitude);
  return {
    minimumLatitude: Math.min(...latitudes),
    maximumLatitude: Math.max(...latitudes),
    minimumLongitude: Math.min(...longitudes),
    maximumLongitude: Math.max(...longitudes),
  };
}

function roundCoordinate(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
