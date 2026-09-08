import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DiscoveryManifest } from "./types.js";

export async function writeDiscoveryExports(
  outputDirectory: string,
  manifest: DiscoveryManifest,
): Promise<Readonly<{ jsonPath: string; csvPath: string; codesPath: string }>> {
  await mkdir(outputDirectory, { recursive: true });
  const jsonPath = path.join(outputDirectory, "stores.json");
  const csvPath = path.join(outputDirectory, "stores.csv");
  const codesPath = path.join(outputDirectory, "store-codes.txt");
  await Promise.all([
    writeFile(jsonPath, `${JSON.stringify(manifest.stores, null, 2)}\n`, "utf8"),
    writeFile(csvPath, toCsv(manifest), "utf8"),
    writeFile(codesPath, `${manifest.stores.map((store) => store.externalCode).join("\n")}\n`, "utf8"),
  ]);
  return { jsonPath, csvPath, codesPath };
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
