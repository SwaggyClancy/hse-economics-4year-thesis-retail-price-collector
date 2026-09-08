import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CollectorCommand } from "../terminal/commands.js";

export interface DailyConfig {
  readonly version: 1;
  readonly timeZone: string;
  readonly jobs: readonly CollectorCommand[];
}

export async function readDailyConfig(file: string, cwd: string): Promise<DailyConfig> {
  const value: unknown = JSON.parse(await readFile(path.resolve(cwd, file), "utf8"));
  if (!isRecord(value) || value.version !== 1 || typeof value.timeZone !== "string" || !Array.isArray(value.jobs) || value.jobs.length === 0) {
    throw new Error("Нужен daily config с version:1, timeZone и jobs");
  }
  new Intl.DateTimeFormat("en", { timeZone: value.timeZone }).format();
  const chains = new Set<string>();
  const jobs = (value.jobs as unknown[]).map((job): CollectorCommand => {
    if (!isRecord(job) || (job.chain !== "pyaterochka" && job.chain !== "magnit") ||
      typeof job.storesFile !== "string" || !job.storesFile.trim() ||
      typeof job.categoriesFile !== "string" || !job.categoriesFile.trim()) throw new Error("Некорректное задание daily config");
    if (chains.has(job.chain)) throw new Error("Каждая сеть допускается в daily config только один раз");
    chains.add(job.chain);
    return { chain: job.chain, args: ["--batch", "--stores-file", path.resolve(cwd, job.storesFile), "--categories-file", path.resolve(cwd, job.categoriesFile), "--headless"] };
  });
  return { version: 1, timeZone: value.timeZone, jobs };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
