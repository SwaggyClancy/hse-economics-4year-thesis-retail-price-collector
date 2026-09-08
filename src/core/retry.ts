import { delay } from "./time.js";

export interface RetryPolicy {
  readonly maxAttempts: number;
  readonly initialDelayMs: number;
  readonly maximumDelayMs: number;
}

export interface RetryEvent {
  readonly attempt: number;
  readonly delayMs: number;
  readonly error: unknown;
}

export interface RetryOptions extends RetryPolicy {
  readonly shouldRetry: (error: unknown) => boolean;
  readonly onRetry: (event: RetryEvent) => Promise<void> | void;
}

export async function withRetry<T>(operation: () => Promise<T>, options: RetryOptions): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === options.maxAttempts || !options.shouldRetry(error)) throw error;

      const exponentialDelay = options.initialDelayMs * 2 ** (attempt - 1);
      const cappedDelay = Math.min(exponentialDelay, options.maximumDelayMs);
      const jitteredDelay = Math.round(cappedDelay * (0.8 + Math.random() * 0.4));
      await options.onRetry({ attempt, delayMs: jitteredDelay, error });
      await delay(jitteredDelay);
    }
  }

  throw lastError;
}
