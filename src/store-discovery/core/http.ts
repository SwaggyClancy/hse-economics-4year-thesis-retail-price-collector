export interface BrowserJsonResponse {
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

export class DiscoveryHttpError extends Error {
  public constructor(
    message: string,
    public readonly status: number,
    public readonly retryAfter: string | null,
  ) {
    super(message);
    this.name = "DiscoveryHttpError";
  }
}

export function assertSuccessfulResponse(response: BrowserJsonResponse): void {
  if (!response.ok) {
    throw new DiscoveryHttpError(
      `HTTP ${response.status} ${response.statusText} для ${new URL(response.url).pathname}`,
      response.status,
      response.retryAfter,
    );
  }
}

export function isRetryableDiscoveryError(error: unknown): boolean {
  if (!(error instanceof DiscoveryHttpError)) return true;
  return error.status === 408 || error.status === 429 || error.status >= 500;
}
