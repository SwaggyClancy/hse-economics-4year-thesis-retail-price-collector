import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";
import { writeDiscoveryExports } from "./core/exports.js";
import { assignDistricts, parseDistrictFeatureCollection, type DistrictFeatureCollection } from "./core/districts.js";
import { DiscoveryStorage } from "./core/json-storage.js";
import type { DiscoveryManifest } from "./core/types.js";
import { discoverMagnitStores } from "./magnit/collector.js";
import { PlaywrightMagnitDiscoveryClient } from "./magnit/page-client.js";
import { discoverPyaterochkaStores } from "./pyaterochka/collector.js";
import { generateGridPoints, type GeoJsonGeometry } from "./pyaterochka/grid.js";
import { PlaywrightPyaterochkaDiscoveryClient } from "./pyaterochka/page-client.js";
import type { DiscoveryPoint } from "./pyaterochka/types.js";

interface CliOptions {
  readonly chain: "magnit" | "pyaterochka";
  readonly city: string;
  readonly query: string;
  readonly geometryPath: string | null;
  readonly pointsPath: string | null;
  readonly spacingMeters: readonly number[];
  readonly headless: boolean;
  readonly browserChannel: "chrome" | "chromium";
  readonly resumeDirectory: string | null;
  readonly districtsPath: string | null;
  readonly municipalDistrictsPath: string | null;
  readonly workingDirectory: string;
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2), process.cwd());
  const storage = options.resumeDirectory === null
    ? await DiscoveryStorage.create(
      path.join(options.workingDirectory, "data", "raw"),
      options.chain,
      options.city,
      new Date(),
    )
    : DiscoveryStorage.open(options.resumeDirectory);
  const context = await launchContext(options);
  try {
    const page = context.pages()[0] ?? await context.newPage();
    const collectedManifest = options.chain === "magnit"
      ? await runMagnit(page, storage, options)
      : await runPyaterochka(page, storage, options);
    const administrative = await loadDistricts(options.districtsPath);
    const municipal = await loadDistricts(options.municipalDistrictsPath);
    const stores = assignDistricts(collectedManifest.stores, administrative, municipal);
    const manifest: DiscoveryManifest = { ...collectedManifest, stores };
    const manifestPath = await storage.writeManifest(manifest);
    const exports = await writeDiscoveryExports(storage.runDirectory, manifest);
    console.log(JSON.stringify({
      chain: manifest.chain,
      city: manifest.city,
      uniqueStoreCount: manifest.uniqueStoreCount,
      rawRequestCount: manifest.rawRequestCount,
      failedRequestCount: manifest.failedRequestCount,
      manifestPath,
      ...exports,
    }, null, 2));
  } finally {
    await context.close();
  }
}

async function runMagnit(
  page: Page,
  storage: DiscoveryStorage,
  options: CliOptions,
): Promise<DiscoveryManifest> {
  await page.goto("https://magnit.ru/", { waitUntil: "domcontentloaded", timeout: 60000 });
  return discoverMagnitStores(new PlaywrightMagnitDiscoveryClient(page), storage, {
    city: options.city,
    query: options.query,
    storeTypes: ["MM", "GM", "MO", "ME", "MC", "MM_MINI", "ZARYAD"],
    pageSize: 50,
    maximumPages: 100,
    maximumPasses: 5,
    minimumDelayMs: 1500,
    maximumDelayMs: 3000,
    maxAttempts: 3,
  });
}

async function runPyaterochka(
  page: Page,
  storage: DiscoveryStorage,
  options: CliOptions,
): Promise<DiscoveryManifest> {
  await page.goto("https://5ka.ru/", { waitUntil: "domcontentloaded", timeout: 60000 });
  if (isPyaterochkaAccessChallengeUrl(page.url())) {
    throw new Error(
      "Пятёрочка запросила ручную защитную проверку. " +
      "Откройте отдельный профиль командой profile:pyaterochka и завершите проверку вручную",
    );
  }
  const points = await loadPoints(options);
  console.log(`Подготовлено точек Пятёрочки: ${points.length}`);
  return discoverPyaterochkaStores(new PlaywrightPyaterochkaDiscoveryClient(page), storage, {
    city: options.city,
    points,
    minimumDelayMs: 8000,
    maximumDelayMs: 15000,
    maxAttempts: 3,
    maximumConsecutiveFailures: 3,
    noStoreStatuses: [400, 404],
  });
}

export function isPyaterochkaAccessChallengeUrl(url: string): boolean {
  const pathname = new URL(url).pathname;
  return pathname.includes("/xpvnsulc/") || pathname.includes("/sp_rotated_captcha/");
}

async function loadPoints(options: CliOptions): Promise<readonly DiscoveryPoint[]> {
  if (options.pointsPath !== null) {
    const value = JSON.parse(await readFile(options.pointsPath, "utf8")) as unknown;
    if (!Array.isArray(value)) throw new Error("Файл --points должен содержать JSON-массив точек");
    return value.map((point, index) => parsePoint(point, index));
  }
  if (options.geometryPath === null) {
    throw new Error("Для Пятёрочки требуется --geometry <geojson> или --points <json>");
  }
  const geometry = extractGeometry(JSON.parse(await readFile(options.geometryPath, "utf8")) as unknown);
  const allPoints = options.spacingMeters.flatMap((spacingMeters, level) => [
    ...generateGridPoints(geometry, { spacingMeters, shiftFraction: 0, level: level * 2 + 1 }),
    ...generateGridPoints(geometry, { spacingMeters, shiftFraction: 0.5, level: level * 2 + 2 }),
  ]);
  const unique = new Map(allPoints.map((point) => [`${point.latitude}:${point.longitude}`, point]));
  return [...unique.values()].map((point, index) => ({ ...point, id: `P${index + 1}` }));
}

function parsePoint(value: unknown, index: number): DiscoveryPoint {
  if (!isRecord(value) || typeof value.latitude !== "number" || typeof value.longitude !== "number") {
    throw new Error(`Некорректная точка с индексом ${index}`);
  }
  return {
    id: typeof value.id === "string" ? value.id : `P${index + 1}`,
    level: typeof value.level === "number" ? value.level : 1,
    latitude: value.latitude,
    longitude: value.longitude,
  };
}

function extractGeometry(value: unknown): GeoJsonGeometry {
  if (isGeometry(value)) return value;
  if (isRecord(value) && value.type === "Feature" && isGeometry(value.geometry)) return value.geometry;
  throw new Error("Поддерживается GeoJSON Geometry или Feature типа Polygon/MultiPolygon");
}

function isGeometry(value: unknown): value is GeoJsonGeometry {
  return isRecord(value) && (value.type === "Polygon" || value.type === "MultiPolygon") && Array.isArray(value.coordinates);
}

function parseArguments(arguments_: readonly string[], workingDirectory: string): CliOptions {
  const values = new Map<string, string>();
  let headless = false;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--headless") {
      headless = true;
      continue;
    }
    if (!argument?.startsWith("--")) throw new Error(`Неизвестный аргумент: ${String(argument)}`);
    const value = arguments_[index += 1];
    if (value === undefined) throw new Error(`После ${argument} требуется значение`);
    values.set(argument, value);
  }
  const chain = values.get("--chain");
  if (chain !== "magnit" && chain !== "pyaterochka") {
    throw new Error("--chain должен быть magnit или pyaterochka");
  }
  const city = values.get("--city")?.trim();
  if (!city) throw new Error("Требуется --city");
  const channel = values.get("--browser-channel") ?? "chrome";
  if (channel !== "chrome" && channel !== "chromium") throw new Error("Некорректный --browser-channel");
  const spacings = (values.get("--spacing") ?? "1500").split(",").map(Number);
  if (spacings.some((value) => !Number.isFinite(value) || value <= 0)) throw new Error("Некорректный --spacing");
  return {
    chain,
    city,
    query: values.get("--query") ?? `${city.toLowerCase()},`,
    geometryPath: resolveOptionalPath(values.get("--geometry"), workingDirectory),
    pointsPath: resolveOptionalPath(values.get("--points"), workingDirectory),
    spacingMeters: spacings,
    headless,
    browserChannel: channel,
    resumeDirectory: resolveOptionalPath(values.get("--resume"), workingDirectory),
    districtsPath: resolveOptionalPath(values.get("--districts"), workingDirectory),
    municipalDistrictsPath: resolveOptionalPath(values.get("--municipal-districts"), workingDirectory),
    workingDirectory,
  };
}

async function loadDistricts(filePath: string | null): Promise<DistrictFeatureCollection | null> {
  if (filePath === null) return null;
  return parseDistrictFeatureCollection(JSON.parse(await readFile(filePath, "utf8")) as unknown);
}

function resolveOptionalPath(value: string | undefined, workingDirectory: string): string | null {
  return value === undefined ? null : path.resolve(workingDirectory, value);
}

function launchContext(options: CliOptions): Promise<BrowserContext> {
  const profileDirectory = path.join(options.workingDirectory, "profiles", options.chain);
  return chromium.launchPersistentContext(profileDirectory, {
    headless: options.headless,
    ...(options.browserChannel === "chrome" ? { channel: "chrome" } : {}),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exitCode = 1;
});
