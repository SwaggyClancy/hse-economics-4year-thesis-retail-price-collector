import type { DiscoveredStore } from "./types.js";

type Ring = readonly (readonly [number, number])[];
type Polygon = readonly Ring[];

export interface DistrictFeatureCollection {
  readonly type: "FeatureCollection";
  readonly features: readonly DistrictFeature[];
}

interface DistrictFeature {
  readonly type: "Feature";
  readonly properties: Readonly<Record<string, unknown>> | null;
  readonly geometry: {
    readonly type: "Polygon" | "MultiPolygon";
    readonly coordinates: Polygon | readonly Polygon[];
  };
}

export function assignDistricts(
  stores: readonly DiscoveredStore[],
  administrative: DistrictFeatureCollection | null,
  municipal: DistrictFeatureCollection | null,
): readonly DiscoveredStore[] {
  return stores.map((store) => ({
    ...store,
    administrativeDistrict: administrative === null
      ? store.administrativeDistrict
      : findDistrictName(store.longitude, store.latitude, administrative),
    municipalDistrict: municipal === null
      ? store.municipalDistrict
      : findDistrictName(store.longitude, store.latitude, municipal),
  }));
}

export function parseDistrictFeatureCollection(value: unknown): DistrictFeatureCollection {
  if (!isRecord(value) || value.type !== "FeatureCollection" || !Array.isArray(value.features)) {
    throw new Error("Файл районов должен быть GeoJSON FeatureCollection");
  }
  for (const feature of value.features) {
    if (!isRecord(feature) || feature.type !== "Feature" || !isRecord(feature.geometry) ||
        (feature.geometry.type !== "Polygon" && feature.geometry.type !== "MultiPolygon") ||
        !Array.isArray(feature.geometry.coordinates)) {
      throw new Error("GeoJSON районов содержит неподдерживаемую геометрию");
    }
  }
  return value as unknown as DistrictFeatureCollection;
}

function findDistrictName(
  longitude: number,
  latitude: number,
  collection: DistrictFeatureCollection,
): string | null {
  for (const feature of collection.features) {
    const polygons = feature.geometry.type === "Polygon"
      ? [feature.geometry.coordinates as Polygon]
      : feature.geometry.coordinates as readonly Polygon[];
    if (polygons.some((polygon) => pointInPolygon(longitude, latitude, polygon))) {
      return featureName(feature.properties);
    }
  }
  return null;
}

function featureName(properties: Readonly<Record<string, unknown>> | null): string {
  if (properties === null) throw new Error("Полигон района не содержит properties");
  for (const key of ["name", "NAME", "district", "DISTRICT", "title", "NAME_EN"]) {
    const value = properties[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  throw new Error("В properties района не найдено поле name/district/title");
}

function pointInPolygon(longitude: number, latitude: number, polygon: Polygon): boolean {
  const outer = polygon[0];
  if (outer === undefined || !pointInRing(longitude, latitude, outer)) return false;
  return !polygon.slice(1).some((hole) => pointInRing(longitude, latitude, hole));
}

function pointInRing(longitude: number, latitude: number, ring: Ring): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const current = ring[index];
    const prior = ring[previous];
    if (current === undefined || prior === undefined) continue;
    const [x1, y1] = current;
    const [x2, y2] = prior;
    if ((y1 > latitude) !== (y2 > latitude) &&
        longitude < (x2 - x1) * (latitude - y1) / (y2 - y1) + x1) inside = !inside;
  }
  return inside;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
