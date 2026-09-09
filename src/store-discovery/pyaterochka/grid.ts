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

export function spreadDiscoveryPoints(
  points: readonly DiscoveryPoint[],
  seed: string,
): readonly DiscoveryPoint[] {
  if (points.length < 2) return [...points];
  const hashes = points.map((point) => stableHash(`${seed}:${point.latitude}:${point.longitude}`));
  const selected = new Uint8Array(points.length);
  const minimumDistances = new Float64Array(points.length);
  minimumDistances.fill(Number.POSITIVE_INFINITY);
  const result: DiscoveryPoint[] = [];
  let nextIndex = hashes.reduce(
    (best, hash, index) => hash < (hashes[best] ?? Number.POSITIVE_INFINITY) ? index : best,
    0,
  );

  while (result.length < points.length) {
    const point = points[nextIndex];
    if (point === undefined) throw new Error("Не удалось распределить точки");
    selected[nextIndex] = 1;
    result.push(point);
    let bestDistance = -1;
    let bestHash = Number.POSITIVE_INFINITY;
    let bestIndex = -1;
    for (let index = 0; index < points.length; index += 1) {
      if (selected[index] === 1) continue;
      const candidate = points[index];
      if (candidate === undefined) continue;
      const distance = squaredDistance(point, candidate);
      minimumDistances[index] = Math.min(minimumDistances[index] ?? Number.POSITIVE_INFINITY, distance);
      const candidateDistance = minimumDistances[index] ?? 0;
      const candidateHash = hashes[index] ?? Number.POSITIVE_INFINITY;
      if (candidateDistance > bestDistance ||
          (candidateDistance === bestDistance && candidateHash < bestHash)) {
        bestDistance = candidateDistance;
        bestHash = candidateHash;
        bestIndex = index;
      }
    }
    if (bestIndex < 0) break;
    nextIndex = bestIndex;
  }
  return result;
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

function stableHash(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function squaredDistance(left: Coordinates, right: Coordinates): number {
  const latitude = (left.latitude + right.latitude) / 2 * Math.PI / 180;
  const latitudeDifference = left.latitude - right.latitude;
  const longitudeDifference = (left.longitude - right.longitude) * Math.cos(latitude);
  return latitudeDifference ** 2 + longitudeDifference ** 2;
}
