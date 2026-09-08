import type { Page } from "playwright";
import type { BrowserJsonResponse } from "../core/http.js";
import type { MagnitDetailRequest, MagnitDiscoveryClient } from "./types.js";

const DETAIL_URL = "https://magnit.ru/webgate/v1/stores-facade/search/detail";
const SEARCH_URL = "https://magnit.ru/webgate/v1/stores-facade/search";

interface BrowserFetchResult {
  readonly receivedAt: string;
  readonly status: number;
  readonly statusText: string;
  readonly ok: boolean;
  readonly retryAfter: string | null;
  readonly bodyText: string;
}

export class PlaywrightMagnitDiscoveryClient implements MagnitDiscoveryClient {
  public constructor(private readonly page: Page) {}

  public fetchBasic(
    request: Pick<MagnitDetailRequest, "query" | "storeTypes" | "deliveryTypes">,
  ): Promise<BrowserJsonResponse> {
    return this.fetchPost(SEARCH_URL, {
      filters: buildFilters(request),
    });
  }

  public async fetchDetail(request: MagnitDetailRequest): Promise<BrowserJsonResponse> {
    const payload = buildMagnitDetailPayload(request);
    return this.fetchPost(DETAIL_URL, payload);
  }

  private async fetchPost(url: string, payload: Readonly<Record<string, unknown>>): Promise<BrowserJsonResponse> {
    const requestedAt = new Date().toISOString();
    const startedAt = performance.now();
    const result = await this.page.evaluate(
      async ({ url, body }): Promise<BrowserFetchResult> => {
        const response = await fetch(url, {
          method: "POST",
          credentials: "include",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        return {
          receivedAt: new Date().toISOString(),
          status: response.status,
          statusText: response.statusText,
          ok: response.ok,
          retryAfter: response.headers.get("retry-after"),
          bodyText: await response.text(),
        };
      },
      { url, body: payload },
    );

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

export function buildMagnitDetailPayload(request: MagnitDetailRequest): Readonly<Record<string, unknown>> {
  return {
    filters: buildFilters(request),
    pagination: { offset: request.offset, size: request.size },
    sorting: { sortBy: "SORT_BY_CITY", sortType: "SORT_TYPE_ASC" },
  };
}

function buildFilters(
  request: Pick<MagnitDetailRequest, "query" | "storeTypes" | "deliveryTypes">,
): Readonly<Record<string, unknown>> {
  const filters: Record<string, unknown> = {
    query: request.query,
    storeTypeListV2: request.storeTypes,
  };
  if (request.deliveryTypes !== undefined && request.deliveryTypes.length > 0) {
    filters.deliveryTypeList = request.deliveryTypes;
  }
  return filters;
}

function parseBody(bodyText: string): unknown {
  try {
    return JSON.parse(bodyText) as unknown;
  } catch {
    return bodyText;
  }
}
