import { mkdir, appendFile } from "node:fs/promises";
import path from "node:path";

export type LogLevel = "info" | "warn" | "error";

export interface LogRecord {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly event: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface Logger {
  log(level: LogLevel, event: string, details?: Readonly<Record<string, unknown>>): Promise<void>;
}

export class JsonLinesLogger implements Logger {
  public constructor(
    private readonly logDirectory: string,
    private readonly chain: "pyaterochka" | "magnit" = "pyaterochka",
  ) {}

  public async log(
    level: LogLevel,
    event: string,
    details?: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    const timestamp = new Date().toISOString();
    const date = timestamp.slice(0, 10);
    const directory = path.join(this.logDirectory, date);
    const record: LogRecord = details
      ? { timestamp, level, event, details }
      : { timestamp, level, event };

    await mkdir(directory, { recursive: true });
    await appendFile(path.join(directory, `${this.chain}.jsonl`), `${JSON.stringify(record)}\n`, "utf8");

    const output = `[${timestamp}] ${level.toUpperCase()} ${event}`;
    if (level === "error") console.error(output, details ?? "");
    else if (level === "warn") console.warn(output, details ?? "");
    else console.log(output, details ?? "");
  }
}

export function errorDetails(error: unknown): Readonly<Record<string, unknown>> {
  if (error instanceof Error) return { name: error.name, message: error.message };
  return { name: "UnknownError", message: String(error) };
}
