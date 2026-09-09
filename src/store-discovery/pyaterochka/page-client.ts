import type { Page } from "playwright";
import type { BrowserJsonResponse } from "../core/http.js";
import type { Coordinates } from "../core/types.js";
import type { PyaterochkaDiscoveryClient, PyaterochkaMapBounds } from "./types.js";

interface BrowserFetchResult {
  readonly receivedAt: string;
  readonly status: number;
  readonly statusText: string;
  readonly ok: boolean;
  readonly retryAfter: string | null;
  readonly bodyText: string;
}

export class PlaywrightPyaterochkaDiscoveryClient implements PyaterochkaDiscoveryClient {
  public constructor(private readonly page: Page) {}

  public fetchStore(point: Coordinates): Promise<BrowserJsonResponse> {
    const url = new URL("https://5d.5ka.ru/api/orders/v1/orders/stores/");
    url.search = new URLSearchParams({
      lon: String(point.longitude),
      lat: String(point.latitude),
    }).toString();
    return this.fetchJson(url.toString());
  }

  public fetchStoresMap(bounds: PyaterochkaMapBounds): Promise<BrowserJsonResponse> {
    const url = new URL("https://5d.5ka.ru/api/cita/v1/stores/map");
    url.search = new URLSearchParams({
      top_latitude: String(bounds.topLatitude),
      bottom_latitude: String(bounds.bottomLatitude),
      left_longitude: String(bounds.leftLongitude),
      right_longitude: String(bounds.rightLongitude),
    }).toString();
    return this.fetchJson(url.toString());
  }

  public geocode(query: string): Promise<BrowserJsonResponse> {
    const url = new URL("https://5ka.ru/api/maps/geocode/");
    url.search = new URLSearchParams({ geocode: query }).toString();
    return this.fetchJson(url.toString());
  }

  private async fetchJson(url: string): Promise<BrowserJsonResponse> {
    const requestedAt = new Date().toISOString();
    const startedAt = performance.now();
    const result = await this.page.evaluate(async (requestUrl): Promise<BrowserFetchResult> => {
      const response = await fetch(requestUrl, {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      return {
        receivedAt: new Date().toISOString(),
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        retryAfter: response.headers.get("retry-after"),
        bodyText: await response.text(),
      };
    }, url);
    return {
      requestedAt,
      receivedAt: result.receivedAt,
      durationMs: Math.round(performance.now() - startedAt),
      url,
      status: result.status,
      statusText: result.statusText,
      ok: result.ok,
      retryAfter: result.retryAfter,
      body: parseBody(result.bodyText),
    };
  }
}

function parseBody(bodyText: string): unknown {
  try {
    return JSON.parse(bodyText) as unknown;
  } catch {
    return bodyText;
  }
}
