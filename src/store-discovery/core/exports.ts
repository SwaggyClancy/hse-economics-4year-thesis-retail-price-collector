import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DiscoveryManifest } from "./types.js";

export async function writeDiscoveryExports(
  outputDirectory: string,
  manifest: DiscoveryManifest,
): Promise<Readonly<{ jsonPath: string; csvPath: string; codesPath: string; districtSummaryPath: string }>> {
  await mkdir(outputDirectory, { recursive: true });
  const jsonPath = path.join(outputDirectory, "stores.json");
  const csvPath = path.join(outputDirectory, "stores.csv");
  const codesPath = path.join(outputDirectory, "store-codes.txt");
  const districtSummaryPath = path.join(outputDirectory, "stores-by-district.json");
  await Promise.all([
    writeFile(jsonPath, `${JSON.stringify(manifest.stores, null, 2)}\n`, "utf8"),
    writeFile(csvPath, toCsv(manifest), "utf8"),
    writeFile(codesPath, `${manifest.stores.map((store) => store.externalCode).join("\n")}\n`, "utf8"),
    writeFile(districtSummaryPath, `${JSON.stringify(groupByDistrict(manifest), null, 2)}\n`, "utf8"),
  ]);
  return { jsonPath, csvPath, codesPath, districtSummaryPath };
}

function groupByDistrict(manifest: DiscoveryManifest): Readonly<Record<string, unknown>> {
  return {
    chain: manifest.chain,
    city: manifest.city,
    generatedAt: manifest.finishedAt,
    administrativeDistricts: groupStores(manifest, "administrativeDistrict"),
    municipalDistricts: groupStores(manifest, "municipalDistrict"),
  };
}

function groupStores(
  manifest: DiscoveryManifest,
  field: "administrativeDistrict" | "municipalDistrict",
): readonly Readonly<Record<string, unknown>>[] {
  const groups = new Map<string, typeof manifest.stores[number][]>();
  for (const store of manifest.stores) {
    const name = store[field] ?? "Не определён";
    const group = groups.get(name) ?? [];
    group.push(store);
    groups.set(name, group);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right, "ru"))
    .map(([district, stores]) => ({
      district,
      storeCount: stores.length,
      stores: stores.map((store) => ({
        externalCode: store.externalCode,
        address: store.address,
        latitude: store.latitude,
        longitude: store.longitude,
      })),
    }));
}

function toCsv(manifest: DiscoveryManifest): string {
  const rows = [
    ["chain", "externalCode", "address", "latitude", "longitude", "active", "administrativeDistrict", "municipalDistrict"],
    ...manifest.stores.map((store) => [
      store.chain,
      store.externalCode,
      store.address,
      String(store.latitude),
      String(store.longitude),
      String(store.active),
      store.administrativeDistrict ?? "",
      store.municipalDistrict ?? "",
    ]),
  ];
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}
