import type { Coordinates } from "../core/types.js";

export interface GeocodeResult extends Coordinates {
  readonly administrativeDistrict: string | null;
  readonly municipalDistrict: string | null;
}

export function extractCoordinates(value: unknown): Coordinates {
  for (const geoObject of getGeoObjects(value)) {
    const position = getNestedString(geoObject, ["Point", "pos"]);
    if (position === null) continue;
    const [longitudeText, latitudeText] = position.trim().split(/\s+/u);
    const longitude = Number(longitudeText);
    const latitude = Number(latitudeText);
    if (Number.isFinite(longitude) && Number.isFinite(latitude)) return { longitude, latitude };
  }
  throw new Error("Геокодер Пятёрочки не вернул координаты");
}

export function extractDistricts(value: unknown): Pick<GeocodeResult, "administrativeDistrict" | "municipalDistrict"> {
  const names: string[] = [];
  for (const geoObject of getGeoObjects(value)) {
    const components = getNestedValue(geoObject, [
      "metaDataProperty",
      "GeocoderMetaData",
      "Address",
      "Components",
    ]);
    if (!Array.isArray(components)) continue;
    for (const component of components) {
      if (!isRecord(component) || component.kind !== "district" || typeof component.name !== "string") continue;
      names.push(component.name);
    }
  }
  const uniqueNames = [...new Set(names)];
  const municipalDistrict = uniqueNames.find((name) => /муниципаль|поселение/iu.test(name)) ?? null;
  const administrativeDistrict = uniqueNames.find(
    (name) => /район$/iu.test(name) && !/историческ|муниципаль/iu.test(name),
  ) ?? null;
  return { administrativeDistrict, municipalDistrict };
}

function getGeoObjects(value: unknown): readonly Record<string, unknown>[] {
  const members = getNestedValue(value, ["response", "GeoObjectCollection", "featureMember"]);
  if (!Array.isArray(members)) return [];
  return members.flatMap((member) => {
    if (!isRecord(member) || !isRecord(member.GeoObject)) return [];
    return [member.GeoObject];
  });
}

function getNestedString(value: unknown, keys: readonly string[]): string | null {
  const nested = getNestedValue(value, keys);
  return typeof nested === "string" ? nested : null;
}

function getNestedValue(value: unknown, keys: readonly string[]): unknown {
  let current = value;
  for (const key of keys) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
