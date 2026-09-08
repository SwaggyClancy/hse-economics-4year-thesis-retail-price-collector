import type { Page } from "playwright";

const CATALOG_ORIGIN = "https://5d.5ka.ru";

export interface PageRequest {
  readonly storeId: string;
  readonly categoryId: string;
  readonly limit: number;
  readonly offset: number;
}

export interface PageResponse {
  readonly requestedAt: string;
  readonly receivedAt: string;
  readonly durationMs: number;
  readonly url: string;
  readonly status: number;
  readonly statusText: string;
  readonly ok: boolean;
  readonly retryAfter: string | null;
  readonly body: unknown;
}

export interface PyaterochkaPageClient {
  fetchPage(request: PageRequest): Promise<PageResponse>;
}

interface BrowserFetchResult {
  readonly receivedAt: string;
  readonly status: number;
  readonly statusText: string;
  readonly ok: boolean;
  readonly retryAfter: string | null;
  readonly bodyText: string;
}

export class PlaywrightPyaterochkaPageClient implements PyaterochkaPageClient {
  public constructor(private readonly page: Page) {}

  public async fetchPage(request: PageRequest): Promise<PageResponse> {
    const url = buildProductsUrl(request);
    const requestedAt = new Date().toISOString();
    const startedAt = performance.now();
    const result = await this.page.evaluate(async (requestUrl): Promise<BrowserFetchResult> => {
      const response = await fetch(requestUrl, {
        credentials: "include",
        signal: AbortSignal.timeout(30000),
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

    let body: unknown;
    try {
      body = JSON.parse(result.bodyText) as unknown;
    } catch {
      body = result.bodyText;
    }

    return {
      requestedAt,
      receivedAt: result.receivedAt,
      durationMs: Math.round(performance.now() - startedAt),
      url,
      status: result.status,
      statusText: result.statusText,
      ok: result.ok,
      retryAfter: result.retryAfter,
      body,
    };
  }
}

export function buildProductsUrl(request: PageRequest): string {
  const url = new URL(
    `/api/catalog/v2/stores/${encodeURIComponent(request.storeId)}` +
      `/categories/${encodeURIComponent(request.categoryId)}/products`,
    CATALOG_ORIGIN,
  );
  url.search = new URLSearchParams({
    mode: "delivery",
    include_restrict: "true",
    limit: String(request.limit),
    offset: String(request.offset),
  }).toString();
  return url.toString();
}
