export class HttpResponseError extends Error {
  public constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly retryAfter: string | null,
  ) {
    super(`HTTP ${status}${statusText ? ` ${statusText}` : ""}`);
    this.name = "HttpResponseError";
  }
}

export class InvalidResponseError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "InvalidResponseError";
  }
}

export function isRetryableCollectionError(error: unknown): boolean {
  if (error instanceof InvalidResponseError) return false;
  if (!(error instanceof HttpResponseError)) return error instanceof Error;
  if (error.status === 429 || error.retryAfter !== null) return false;
  return [408, 425, 500, 502, 503, 504].includes(error.status);
}
