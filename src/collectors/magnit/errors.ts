export class MagnitHttpResponseError extends Error {
  public constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly retryAfter: string | null,
  ) {
    super(`HTTP ${status}${statusText ? ` ${statusText}` : ""}`);
    this.name = "MagnitHttpResponseError";
  }
}

export class MagnitInvalidResponseError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "MagnitInvalidResponseError";
  }
}

export function isRetryableMagnitError(error: unknown): boolean {
  if (error instanceof MagnitInvalidResponseError) return false;
  if (!(error instanceof MagnitHttpResponseError)) return error instanceof Error;
  // Stop this small run when the server asks us to wait; never retry earlier than requested.
  if (error.status === 429 || error.retryAfter !== null) return false;
  return [408, 425, 500, 502, 503, 504].includes(error.status);
}
