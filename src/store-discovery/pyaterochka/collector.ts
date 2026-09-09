import { withRetry } from "../../core/retry.js";
import { delay, randomInteger } from "../../core/time.js";
import {
  assertSuccessfulResponse,
  isRetryableDiscoveryError,
  type BrowserJsonResponse,
} from "../core/http.js";
import type { DiscoveryStorage } from "../core/json-storage.js";
import type { DiscoveredStore, DiscoveryManifest } from "../core/types.js";
import { extractCoordinates, extractDistricts } from "./geocode.js";
import type {
  DiscoveryPoint,
  PyaterochkaDiscoveryClient,
  PyaterochkaStoreResponse,
} from "./types.js";

export interface PyaterochkaDiscoveryOptions {
  readonly city: string;
  readonly points: readonly DiscoveryPoint[];
  readonly minimumDelayMs: number;
  readonly maximumDelayMs: number;
  readonly maxAttempts: number;
  readonly maximumConsecutiveFailures: number;
  readonly noStoreStatuses: readonly number[];
}

interface PendingStore {
  readonly externalCode: string;
  readonly address: string;
  readonly storeCity: string | null;
  readonly hasDelivery: boolean;
  readonly has24hDelivery: boolean;
  readonly discoveredAt: string;
  readonly pointIds: string[];
}

export async function discoverPyaterochkaStores(
  client: PyaterochkaDiscoveryClient,
  storage: DiscoveryStorage,
  options: PyaterochkaDiscoveryOptions,
): Promise<DiscoveryManifest> {
  const checkpoint = parseCheckpoint(await storage.readCheckpoint(), options.city);
  const startedAt = checkpoint?.startedAt ?? new Date().toISOString();
  const stores = new Map((checkpoint?.stores ?? []).map((store) => [store.externalCode, store]));
  let rawRequestCount = checkpoint?.rawRequestCount ?? 0;
  let failedRequestCount = checkpoint?.failedRequestCount ?? 0;
  const firstPointIndex = checkpoint?.completedPointCount ?? 0;
  let consecutiveFailures = 0;

  for (let index = firstPointIndex; index < options.points.length; index += 1) {
    const point = options.points[index];
    if (point === undefined) continue;
    let response: BrowserJsonResponse;
    try {
      response = await fetchWithRetry(
        () => client.fetchStore(point),
        options,
        options.noStoreStatuses,
      );
    } catch (error) {
      rawRequestCount += 1;
      failedRequestCount += 1;
      await storage.writeRawResponse(rawRequestCount, `point-${point.id}-failure`, {
        point,
        failedAt: new Date().toISOString(),
        error: error instanceof Error
          ? { name: error.name, message: error.message }
          : { name: "UnknownError", message: String(error) },
      });
      await writeCheckpoint(
        storage,
        options.city,
        startedAt,
        index + 1,
        rawRequestCount,
        failedRequestCount,
        stores,
      );
      consecutiveFailures += 1;
      if (consecutiveFailures >= options.maximumConsecutiveFailures) {
        throw new Error(
          `Остановлено после ${consecutiveFailures} последовательных сетевых ошибок; ` +
          "возможна защитная проверка Пятёрочки",
        );
      }
      await delay(randomInteger(options.minimumDelayMs, options.maximumDelayMs));
      continue;
    }
    consecutiveFailures = 0;
    rawRequestCount += 1;
    await storage.writeRawResponse(rawRequestCount, `point-${point.id}`, { point, response });
    if (options.noStoreStatuses.includes(response.status)) {
      await writeCheckpoint(storage, options.city, startedAt, index + 1, rawRequestCount, failedRequestCount, stores);
      continue;
    }
    const item = parseStoreResponse(response.body);
    if (item.has_delivery !== true) {
      await writeCheckpoint(storage, options.city, startedAt, index + 1, rawRequestCount, failedRequestCount, stores);
      continue;
    }
    const existing = stores.get(item.sap_code);
    if (existing === undefined) {
      stores.set(item.sap_code, {
        externalCode: item.sap_code,
        address: item.shop_address,
        storeCity: item.store_city ?? null,
        hasDelivery: true,
        has24hDelivery: item.has_24h_delivery === true,
        discoveredAt: response.receivedAt,
        pointIds: [point.id],
      });
    } else {
      existing.pointIds.push(point.id);
    }
    await writeCheckpoint(storage, options.city, startedAt, index + 1, rawRequestCount, failedRequestCount, stores);
    if (index + 1 < options.points.length) {
      await delay(randomInteger(options.minimumDelayMs, options.maximumDelayMs));
    }
  }

  const normalized: DiscoveredStore[] = [];
  for (const store of stores.values()) {
    const forward = await fetchWithRetry(() => client.geocode(store.address), options, []);
    rawRequestCount += 1;
    await storage.writeRawResponse(rawRequestCount, `geocode-${store.externalCode}`, forward);
    const coordinates = extractCoordinates(forward.body);
    await delay(randomInteger(options.minimumDelayMs, options.maximumDelayMs));
    const reverseQuery = `${coordinates.longitude},${coordinates.latitude}`;
    const reverse = await fetchWithRetry(() => client.geocode(reverseQuery), options, []);
    rawRequestCount += 1;
    await storage.writeRawResponse(rawRequestCount, `reverse-${store.externalCode}`, reverse);
    const districts = extractDistricts(reverse.body);
    normalized.push({
      chain: "pyaterochka",
      externalCode: store.externalCode,
      address: store.address,
      ...coordinates,
      active: store.hasDelivery,
      ...districts,
      discoveredAt: store.discoveredAt,
      metadata: {
        storeCity: store.storeCity,
        hasDelivery: store.hasDelivery,
        has24hDelivery: store.has24hDelivery,
        discoveryPointIds: store.pointIds,
      },
    });
    await delay(randomInteger(options.minimumDelayMs, options.maximumDelayMs));
  }

  return {
    version: 1,
    chain: "pyaterochka",
    city: options.city,
    startedAt,
    finishedAt: new Date().toISOString(),
    rawRequestCount,
    failedRequestCount,
    uniqueStoreCount: normalized.length,
    stores: normalized.sort((left, right) => left.externalCode.localeCompare(right.externalCode)),
  };
}

export function parseStoreResponse(value: unknown): Required<Pick<
  PyaterochkaStoreResponse,
  "shop_address" | "sap_code" | "has_delivery"
>> & PyaterochkaStoreResponse {
  if (!isRecord(value) || typeof value.shop_address !== "string" ||
      typeof value.sap_code !== "string" || typeof value.has_delivery !== "boolean") {
    throw new Error("Некорректный ответ Pyaterochka orders/stores");
  }
  return value as Required<Pick<
    PyaterochkaStoreResponse,
    "shop_address" | "sap_code" | "has_delivery"
  >> & PyaterochkaStoreResponse;
}

async function fetchWithRetry(
  operation: () => Promise<BrowserJsonResponse>,
  options: Pick<PyaterochkaDiscoveryOptions, "maxAttempts">,
  allowedStatuses: readonly number[],
): Promise<BrowserJsonResponse> {
  return withRetry(async () => {
    const response = await operation();
    if (!allowedStatuses.includes(response.status)) assertSuccessfulResponse(response);
    return response;
  }, {
    maxAttempts: options.maxAttempts,
    initialDelayMs: 1500,
    maximumDelayMs: 15000,
    shouldRetry: isRetryableDiscoveryError,
    onRetry: () => undefined,
  });
}

async function writeCheckpoint(
  storage: DiscoveryStorage,
  city: string,
  startedAt: string,
  completedPointCount: number,
  rawRequestCount: number,
  failedRequestCount: number,
  stores: ReadonlyMap<string, PendingStore>,
): Promise<void> {
  await storage.writeCheckpoint({
    version: 1,
    chain: "pyaterochka",
    city,
    startedAt,
    completedPointCount,
    rawRequestCount,
    failedRequestCount,
    stores: [...stores.values()],
  });
}

interface PyaterochkaCheckpoint {
  readonly startedAt: string;
  readonly completedPointCount: number;
  readonly rawRequestCount: number;
  readonly failedRequestCount: number;
  readonly stores: readonly PendingStore[];
}

function parseCheckpoint(value: unknown, city: string): PyaterochkaCheckpoint | null {
  if (value === null) return null;
  if (!isRecord(value) || value.chain !== "pyaterochka" || value.city !== city ||
      typeof value.startedAt !== "string" || typeof value.completedPointCount !== "number" ||
      typeof value.rawRequestCount !== "number" ||
      !(value.failedRequestCount === undefined || typeof value.failedRequestCount === "number") ||
      !Array.isArray(value.stores)) {
    throw new Error("Некорректный checkpoint обнаружения Пятёрочки");
  }
  return {
    ...(value as unknown as PyaterochkaCheckpoint),
    failedRequestCount: typeof value.failedRequestCount === "number" ? value.failedRequestCount : 0,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
