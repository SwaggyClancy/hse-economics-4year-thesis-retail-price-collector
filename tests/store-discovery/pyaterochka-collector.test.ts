import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { BrowserJsonResponse } from "../../src/store-discovery/core/http.js";
import { DiscoveryStorage } from "../../src/store-discovery/core/json-storage.js";
import { discoverPyaterochkaStores } from "../../src/store-discovery/pyaterochka/collector.js";
import type { PyaterochkaDiscoveryClient } from "../../src/store-discovery/pyaterochka/types.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("pyaterochka store discovery", () => {
  it("устраняет дубли sap_code и геокодирует адрес один раз", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pyaterochka-discovery-"));
    temporaryDirectories.push(root);
    const geocodeQueries: string[] = [];
    const client: PyaterochkaDiscoveryClient = {
      fetchStore: () => Promise.resolve(response({
        shop_address: "Санкт-Петербург г, Запорожская ул, Дом 23",
        store_city: null,
        sap_code: "324K",
        has_delivery: true,
        has_24h_delivery: false,
      })),
      geocode(query) {
        geocodeQueries.push(query);
        return Promise.resolve(response(query.includes(",") && /^\d/u.test(query)
          ? districtResponse()
          : coordinateResponse()));
      },
    };
    const storage = await DiscoveryStorage.create(root, "pyaterochka", "Санкт-Петербург", new Date("2026-09-01T00:00:00Z"));
    const result = await discoverPyaterochkaStores(client, storage, {
      city: "Санкт-Петербург",
      points: [
        { id: "P1", level: 1, latitude: 59.85, longitude: 30.46 },
        { id: "P2", level: 1, latitude: 59.86, longitude: 30.47 },
      ],
      minimumDelayMs: 0,
      maximumDelayMs: 0,
      maxAttempts: 1,
      noStoreStatuses: [404],
    });
    expect(result.uniqueStoreCount).toBe(1);
    expect(geocodeQueries).toHaveLength(2);
    expect(result.stores[0]).toMatchObject({
      externalCode: "324K",
      administrativeDistrict: "Невский район",
      municipalDistrict: "муниципальный округ Обуховский",
    });
    expect(result.stores[0]?.metadata.discoveryPointIds).toEqual(["P1", "P2"]);
  });
});

function response(body: unknown): BrowserJsonResponse {
  return {
    requestedAt: "2026-09-01T00:00:00.000Z",
    receivedAt: "2026-09-01T00:00:00.100Z",
    durationMs: 100,
    url: "https://example.test",
    status: 200,
    statusText: "OK",
    ok: true,
    retryAfter: null,
    body,
  };
}

function coordinateResponse(): unknown {
  return { response: { GeoObjectCollection: { featureMember: [{ GeoObject: { Point: { pos: "30.468115 59.851209" } } }] } } };
}

function districtResponse(): unknown {
  return {
    response: {
      GeoObjectCollection: {
        featureMember: [{
          GeoObject: {
            metaDataProperty: {
              GeocoderMetaData: {
                Address: { Components: [
                  { kind: "district", name: "Невский район" },
                  { kind: "district", name: "муниципальный округ Обуховский" },
                ] },
              },
            },
          },
        }],
      },
    },
  };
}
