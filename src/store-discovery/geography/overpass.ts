type Coordinate = readonly [number, number];
type Ring = readonly Coordinate[];

interface OverpassPoint {
  readonly lat: number;
  readonly lon: number;
}

interface OverpassMember {
  readonly type: string;
  readonly role: string;
  readonly geometry?: readonly OverpassPoint[];
}

interface OverpassRelation {
  readonly type: "relation";
  readonly id: number;
  readonly tags?: Readonly<Record<string, string>>;
  readonly members?: readonly OverpassMember[];
}

interface OverpassEnvelope {
  readonly elements: readonly OverpassRelation[];
}

export interface GeoJsonFeatureCollection {
  readonly type: "FeatureCollection";
  readonly features: readonly GeoJsonFeature[];
}

interface GeoJsonFeature {
  readonly type: "Feature";
  readonly properties: Readonly<Record<string, unknown>>;
  readonly geometry: {
    readonly type: "MultiPolygon";
    readonly coordinates: readonly (readonly Ring[])[];
  };
}

export function convertOverpassRelations(value: unknown): GeoJsonFeatureCollection {
  if (!isRecord(value) || !Array.isArray(value.elements)) {
    throw new Error("Некорректный JSON Overpass");
  }
  const envelope = value as unknown as OverpassEnvelope;
  const features = envelope.elements.map(convertRelation);
  return { type: "FeatureCollection", features };
}

function convertRelation(relation: OverpassRelation): GeoJsonFeature {
  if (relation.type !== "relation") throw new Error("Ожидалась relation Overpass");
  const members = relation.members ?? [];
  const outerRings = stitchRings(memberSegments(members, "outer"));
  const innerRings = stitchRings(memberSegments(members, "inner"));
  if (outerRings.length === 0) throw new Error(`Relation ${relation.id} не содержит замкнутой внешней границы`);
  const polygons = outerRings.map((outer) => [
    outer,
    ...innerRings.filter((inner) => {
      const point = inner[0];
      return point !== undefined && pointInRing(point, outer);
    }),
  ]);
  return {
    type: "Feature",
    properties: {
      ...(relation.tags ?? {}),
      osmType: "relation",
      osmId: relation.id,
    },
    geometry: { type: "MultiPolygon", coordinates: polygons },
  };
}

function memberSegments(members: readonly OverpassMember[], role: "outer" | "inner"): Ring[] {
  return members.flatMap((member) => {
    if (member.type !== "way" || member.role !== role || member.geometry === undefined) return [];
    return [member.geometry.map((point): Coordinate => [point.lon, point.lat])];
  });
}

export function stitchRings(sourceSegments: readonly Ring[]): Ring[] {
  const remaining = sourceSegments.filter((segment) => segment.length >= 2).map((segment) => [...segment]);
  const rings: Coordinate[][] = [];
  while (remaining.length > 0) {
    const ring = remaining.shift();
    if (ring === undefined) break;
    while (!samePoint(ring[0], ring[ring.length - 1])) {
      const endpoint = ring[ring.length - 1];
      const matchIndex = remaining.findIndex((segment) =>
        samePoint(segment[0], endpoint) || samePoint(segment[segment.length - 1], endpoint));
      if (matchIndex < 0) throw new Error("Не удалось замкнуть составную границу OSM");
      const [next] = remaining.splice(matchIndex, 1);
      if (next === undefined) throw new Error("Не удалось извлечь сегмент границы OSM");
      if (!samePoint(next[0], endpoint)) next.reverse();
      ring.push(...next.slice(1));
    }
    rings.push(ring);
  }
  return rings;
}

function samePoint(left: Coordinate | undefined, right: Coordinate | undefined): boolean {
  return left !== undefined && right !== undefined &&
    Math.abs(left[0] - right[0]) < 1e-7 && Math.abs(left[1] - right[1]) < 1e-7;
}

function pointInRing(point: Coordinate, ring: Ring): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const current = ring[index];
    const prior = ring[previous];
    if (current === undefined || prior === undefined) continue;
    if ((current[1] > point[1]) !== (prior[1] > point[1]) &&
        point[0] < (prior[0] - current[0]) * (point[1] - current[1]) /
          (prior[1] - current[1]) + current[0]) inside = !inside;
  }
  return inside;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
