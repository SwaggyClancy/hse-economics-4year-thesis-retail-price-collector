import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DiscoveryStorage } from "../../src/store-discovery/core/json-storage.js";
import type { BrowserJsonResponse } from "../../src/store-discovery/core/http.js";
import { discoverMagnitStores } from "../../src/store-discovery/magnit/collector.js";
import type { MagnitDetailRequest, MagnitDiscoveryClient } from "../../src/store-discovery/magnit/types.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("magnit store discovery", () => {
  it("обходит страницы и нормализует магазины", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "magnit-discovery-"));
    temporaryDirectories.push(root);
    const requests: MagnitDetailRequest[] = [];
    const all = [store("1"), store("2"), store("3")];
    const client: MagnitDiscoveryClient = {
      fetchBasic: () => Promise.resolve(response({ items: { items: all, typeName: "basic" } })),
      fetchDetail(request) {
        requests.push(request);
        return Promise.resolve(response({ data: all.slice(request.offset, request.offset + request.size), totalCount: 3 }));
      },
    };
    const storage = await DiscoveryStorage.create(root, "magnit", "Санкт-Петербург", new Date("2026-09-01T00:00:00Z"));
    const result = await discoverMagnitStores(client, storage, {
      city: "Санкт-Петербург",
      query: "санкт-петербург,",
      storeTypes: ["MM", "MM_MINI"],
      pageSize: 2,
      maximumPages: 10,
      maximumPasses: 2,
      minimumDelayMs: 0,
      maximumDelayMs: 0,
      maxAttempts: 1,
    });
    expect(requests.map((request) => request.offset)).toEqual([0, 2]);
    expect(result.uniqueStoreCount).toBe(3);
    expect(result.stores[0]).toMatchObject({ externalCode: "1", address: "Адрес 1", active: true });
  });
});

function store(code: string): Record<string, unknown> {
  return {
    address: `Адрес ${code}`,
    coordinates: { latitude: 59 + Number(code) / 100, longitude: 30 },
    externalId: { owner: "OWNER_MAGNIT", storeCode: code },
    isActive: true,
    status: "STATUS_ACTIVE",
    storeType: "STORE_TYPE_MM",
    storeTypeV2: "MM",
    deliveryTypeList: ["DELIVERY_TYPE_OFFLINE"],
  };
}

function response(body: unknown): BrowserJsonResponse {
  return {
    requestedAt: "2026-09-01T00:00:00.000Z",
    receivedAt: "2026-09-01T00:00:00.100Z",
    durationMs: 100,
    url: "https://magnit.ru/webgate/v1/stores-facade/search/detail",
    status: 200,
    statusText: "OK",
    ok: true,
    retryAfter: null,
    body,
  };
}
