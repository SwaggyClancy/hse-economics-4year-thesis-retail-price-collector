import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { writeDiscoveryExports } from "./core/exports.js";
import type { DiscoveryManifest } from "./core/types.js";
import { validateDiscoveryManifest } from "./core/validation.js";

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2), process.cwd());
  const sourceManifestPath = path.join(options.runDirectory, "manifest.json");
  const manifest = parseManifest(JSON.parse(await readFile(sourceManifestPath, "utf8")) as unknown);
  const validation = validateDiscoveryManifest(manifest);
  if (!validation.valid) {
    throw new Error(`Справочник не прошёл проверку: ${JSON.stringify(validation.issues)}`);
  }

  const logicalDate = manifest.finishedAt.slice(0, 10);
  const targetDirectory = path.join(
    options.normalizedDirectory,
    "store-registry",
    logicalDate,
    manifest.chain,
    slug(manifest.city),
  );
  await mkdir(targetDirectory, { recursive: true });
  const exports = await writeDiscoveryExports(targetDirectory, manifest);
  const validationPath = path.join(targetDirectory, "validation.json");
  const provenancePath = path.join(targetDirectory, "provenance.json");
  await Promise.all([
    writeFile(validationPath, `${JSON.stringify(validation, null, 2)}\n`, "utf8"),
    writeFile(provenancePath, `${JSON.stringify({
      version: 1,
      publishedAt: new Date().toISOString(),
      sourceManifest: path.relative(process.cwd(), sourceManifestPath),
      chain: manifest.chain,
      city: manifest.city,
      discoveryStartedAt: manifest.startedAt,
      discoveryFinishedAt: manifest.finishedAt,
    }, null, 2)}\n`, "utf8"),
  ]);
  console.log(JSON.stringify({ targetDirectory, validationPath, provenancePath, validation, ...exports }, null, 2));
}

interface PublishOptions {
  readonly runDirectory: string;
  readonly normalizedDirectory: string;
}

function parseArguments(arguments_: readonly string[], cwd: string): PublishOptions {
  const runIndex = arguments_.indexOf("--run");
  const run = runIndex < 0 ? undefined : arguments_[runIndex + 1];
  if (!run) throw new Error("Требуется --run <каталог запуска>");
  const normalizedIndex = arguments_.indexOf("--normalized");
  const normalized = normalizedIndex < 0 ? "data/normalized" : arguments_[normalizedIndex + 1];
  if (!normalized) throw new Error("После --normalized требуется путь");
  return {
    runDirectory: path.resolve(cwd, run),
    normalizedDirectory: path.resolve(cwd, normalized),
  };
}

function parseManifest(value: unknown): DiscoveryManifest {
  if (!isRecord(value) || value.version !== 1 ||
      (value.chain !== "magnit" && value.chain !== "pyaterochka") ||
      typeof value.city !== "string" || typeof value.startedAt !== "string" ||
      typeof value.finishedAt !== "string" || typeof value.rawRequestCount !== "number" ||
      !(value.failedRequestCount === undefined || typeof value.failedRequestCount === "number") ||
      typeof value.uniqueStoreCount !== "number" || !Array.isArray(value.stores)) {
    throw new Error("Некорректный manifest обнаружения магазинов");
  }
  return {
    ...(value as unknown as DiscoveryManifest),
    failedRequestCount: typeof value.failedRequestCount === "number" ? value.failedRequestCount : 0,
  };
}

function slug(value: string): string {
  return value.toLowerCase().replaceAll(/[^a-zа-яё0-9]+/giu, "-").replace(/^-|-$/gu, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exitCode = 1;
});
