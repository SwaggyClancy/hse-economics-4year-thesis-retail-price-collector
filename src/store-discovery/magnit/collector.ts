import { withRetry } from "../../core/retry.js";
import { delay, randomInteger } from "../../core/time.js";
import { assertSuccessfulResponse, isRetryableDiscoveryError } from "../core/http.js";
import type { DiscoveryStorage } from "../core/json-storage.js";
import type { DiscoveredStore, DiscoveryManifest } from "../core/types.js";
import type {
  MagnitDetailEnvelope,
  MagnitDiscoveryClient,
  MagnitBasicEnvelope,
  MagnitStoreDetail,
} from "./types.js";

export interface MagnitDiscoveryOptions {
  readonly city: string;
  readonly query: string;
  readonly storeTypes: readonly string[];
  readonly deliveryTypes?: readonly string[];
  readonly pageSize: number;
  readonly maximumPages: number;
  readonly maximumPasses: number;
  readonly minimumDelayMs: number;
  readonly maximumDelayMs: number;
  readonly maxAttempts: number;
}

export async function discoverMagnitStores(
  client: MagnitDiscoveryClient,
  storage: DiscoveryStorage,
  options: MagnitDiscoveryOptions,
): Promise<DiscoveryManifest> {
  const checkpoint = parseCheckpoint(await storage.readCheckpoint(), options.city);
  const startedAt = checkpoint?.startedAt ?? new Date().toISOString();
  const stores = new Map((checkpoint?.stores ?? []).map((store) => [store.externalCode, store]));
  let rawRequestCount = checkpoint?.rawRequestCount ?? 0;
  let expectedTotal: number | null = checkpoint?.expectedTotal ?? null;
  let expectedCodes = new Set(checkpoint?.expectedCodes ?? []);

  if (expectedCodes.size === 0) {
    const basicResponse = await withRetry(async () => {
      const result = await client.fetchBasic({
        query: options.query,
        storeTypes: options.storeTypes,
        ...(options.deliveryTypes === undefined ? {} : { deliveryTypes: options.deliveryTypes }),
      });
      assertSuccessfulResponse(result);
      return result;
    }, {
      maxAttempts: options.maxAttempts,
      initialDelayMs: 1500,
      maximumDelayMs: 15000,
      shouldRetry: isRetryableDiscoveryError,
      onRetry: () => undefined,
    });
    rawRequestCount += 1;
    await storage.writeRawResponse(rawRequestCount, "search-basic", basicResponse);
    expectedCodes = new Set(parseMagnitBasicEnvelope(basicResponse.body).items.items.map((item) => {
      const code = item.externalId?.storeCode;
      if (!code) throw new Error("Краткая карточка Магнита не содержит storeCode");
      return code;
    }));
  }

  let completed = expectedCodes.size > 0 && [...expectedCodes].every((code) => stores.has(code));
  for (let pass = 0; pass < options.maximumPasses && !completed; pass += 1) {
    const sizeBeforePass = stores.size;
    for (let pageNumber = 0; pageNumber < options.maximumPages; pageNumber += 1) {
      const offset = pageNumber * options.pageSize;
    const response = await withRetry(
      async () => {
        const result = await client.fetchDetail({
          query: options.query,
          storeTypes: options.storeTypes,
          ...(options.deliveryTypes === undefined ? {} : { deliveryTypes: options.deliveryTypes }),
          offset,
          size: options.pageSize,
        });
        assertSuccessfulResponse(result);
        return result;
      },
      {
        maxAttempts: options.maxAttempts,
        initialDelayMs: 1500,
        maximumDelayMs: 15000,
        shouldRetry: isRetryableDiscoveryError,
        onRetry: () => undefined,
      },
    );
      rawRequestCount += 1;
      await storage.writeRawResponse(rawRequestCount, `detail-pass-${pass + 1}-offset-${offset}`, response);
      const envelope = parseMagnitDetailEnvelope(response.body);
      expectedTotal ??= envelope.totalCount;
      if (expectedTotal !== envelope.totalCount) {
        throw new Error(`totalCount изменился во время обхода: ${expectedTotal} → ${envelope.totalCount}`);
      }

      for (const item of envelope.data) {
        const store = normalizeMagnitStore(item, response.receivedAt);
        stores.set(store.externalCode, store);
      }
      await storage.writeCheckpoint({
        version: 1,
        chain: "magnit",
        city: options.city,
        startedAt,
        expectedTotal,
        expectedCodes: [...expectedCodes],
        rawRequestCount,
        stores: [...stores.values()],
      });

      if (offset + options.pageSize >= envelope.totalCount) break;
      if (envelope.data.length === 0) throw new Error(`Пустая страница Магнита до totalCount, offset=${offset}`);
      await delay(randomInteger(options.minimumDelayMs, options.maximumDelayMs));
    }
    completed = [...expectedCodes].every((code) => stores.has(code));
    if (!completed && stores.size === sizeBeforePass) break;
  }

  if (expectedTotal === null) throw new Error("Магнит не вернул ни одной страницы");
  const missingCodes = [...expectedCodes].filter((code) => !stores.has(code));
  if (missingCodes.length > 0) {
    throw new Error(`Не получены подробности для ${missingCodes.length} из ${expectedCodes.size} кодов Магнита`);
  }
  return {
    version: 1,
    chain: "magnit",
    city: options.city,
    startedAt,
    finishedAt: new Date().toISOString(),
    rawRequestCount,
    failedRequestCount: 0,
    uniqueStoreCount: stores.size,
    stores: [...stores.values()].sort((left, right) => left.externalCode.localeCompare(right.externalCode)),
  };
}

interface MagnitCheckpoint {
  readonly startedAt: string;
  readonly expectedTotal: number | null;
  readonly expectedCodes: readonly string[];
  readonly rawRequestCount: number;
  readonly stores: readonly DiscoveredStore[];
}

function parseCheckpoint(value: unknown, city: string): MagnitCheckpoint | null {
  if (value === null) return null;
  if (!isRecord(value) || value.chain !== "magnit" || value.city !== city ||
      typeof value.startedAt !== "string" ||
      typeof value.rawRequestCount !== "number" || !Array.isArray(value.stores) ||
      !Array.isArray(value.expectedCodes) ||
      !(value.expectedTotal === null || typeof value.expectedTotal === "number")) {
    throw new Error("Некорректный checkpoint обнаружения Магнита");
  }
  return value as unknown as MagnitCheckpoint;
}

export function parseMagnitBasicEnvelope(value: unknown): MagnitBasicEnvelope {
  if (!isRecord(value) || !isRecord(value.items) || !Array.isArray(value.items.items)) {
    throw new Error("Некорректный ответ Magnit search");
  }
  return value as unknown as MagnitBasicEnvelope;
}

export function parseMagnitDetailEnvelope(value: unknown): MagnitDetailEnvelope {
  if (!isRecord(value) || !Array.isArray(value.data) || typeof value.totalCount !== "number") {
    throw new Error("Некорректный ответ Magnit search/detail");
  }
  return value as unknown as MagnitDetailEnvelope;
}

export function normalizeMagnitStore(item: MagnitStoreDetail, discoveredAt: string): DiscoveredStore {
  const code = item.externalId?.storeCode;
  const latitude = item.coordinates?.latitude;
  const longitude = item.coordinates?.longitude;
  if (!code || typeof item.address !== "string" || typeof latitude !== "number" || typeof longitude !== "number") {
    throw new Error("Карточка Магнита не содержит storeCode, address или coordinates");
  }
  return {
    chain: "magnit",
    externalCode: code,
    address: item.address,
    latitude,
    longitude,
    active: item.isActive === true && item.status === "STATUS_ACTIVE",
    administrativeDistrict: null,
    municipalDistrict: null,
    discoveredAt,
    metadata: {
      owner: item.externalId?.owner ?? null,
      cityFiasId: item.cityFiasId ?? null,
      status: item.status ?? null,
      storeType: item.storeType ?? null,
      storeTypeV2: item.storeTypeV2 ?? null,
      deliveryTypeList: item.deliveryTypeList ?? [],
      timetableList: item.timetableList ?? [],
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
