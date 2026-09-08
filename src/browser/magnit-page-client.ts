import { randomUUID } from "node:crypto";
import type { Page } from "playwright";

export const MAGNIT_SEARCH_URL = "https://magnit.ru/webgate/v2/goods/search";

export interface MagnitPageRequest {
  readonly storeCode: string;
  readonly categoryId: number;
  readonly limit: number;
  readonly offset: number;
}

export interface MagnitPageResponse {
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

export interface MagnitPageClient {
  fetchPage(request: MagnitPageRequest): Promise<MagnitPageResponse>;
}

interface BrowserFetchResult {
  readonly receivedAt: string;
  readonly status: number;
  readonly statusText: string;
  readonly ok: boolean;
  readonly retryAfter: string | null;
  readonly bodyText: string;
}

export class PlaywrightMagnitPageClient implements MagnitPageClient {
  private readonly deviceId = randomUUID();

  public constructor(private readonly page: Page) {}

  public async fetchPage(request: MagnitPageRequest): Promise<MagnitPageResponse> {
    const requestedAt = new Date().toISOString();
    const startedAt = performance.now();
    const result = await this.page.evaluate(
      async ({ requestBody, deviceId }): Promise<BrowserFetchResult> => {
        const response = await fetch("https://magnit.ru/webgate/v2/goods/search", {
          method: "POST",
          credentials: "include",
          signal: AbortSignal.timeout(30000),
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "X-App-Version": "2026.3.12-19.7",
            "X-Client-Name": "magnit",
            "X-Device-Id": deviceId,
            "X-Device-Platform": "Web",
            "X-Device-Tag": "disabled",
            "X-New-Magnit": "true",
            "X-Platform-Version": "Windows Chrome 146",
          },
          body: JSON.stringify(requestBody),
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
      { requestBody: buildMagnitRequestBody(request), deviceId: this.deviceId },
    );

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
      url: MAGNIT_SEARCH_URL,
      status: result.status,
      statusText: result.statusText,
      ok: result.ok,
      retryAfter: result.retryAfter,
      body,
    };
  }
}

export function buildMagnitRequestBody(request: MagnitPageRequest): Readonly<Record<string, unknown>> {
  return {
    sort: { order: "desc", type: "popularity" },
    pagination: { limit: request.limit, offset: request.offset },
    categories: [request.categoryId],
    includeAdultGoods: true,
    storeCode: request.storeCode,
    storeType: "1",
    catalogType: "1",
  };
}
