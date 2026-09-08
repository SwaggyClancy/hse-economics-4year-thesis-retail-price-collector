import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CollectionTaskInput, CollectionTaskState } from "../types.js";

export interface MagnitRunState {
  readonly version: 1;
  readonly chain: "magnit";
  readonly runId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly timeZone: string;
  readonly status: "running" | "paused" | "completed" | "completed_with_errors";
  readonly tasks: readonly CollectionTaskState[];
}

export interface MagnitStateSink {
  save(state: MagnitRunState): Promise<void>;
}

export function createMagnitState(inputs: readonly CollectionTaskInput[], timeZone: string): MagnitRunState {
  const timestamp = new Date().toISOString();
  const state: MagnitRunState = {
    version: 1, chain: "magnit", runId: `magnit_${randomUUID()}`,
    createdAt: timestamp, updatedAt: timestamp, timeZone, status: "running",
    tasks: inputs.map(({ storeId, categoryId }) => ({
      id: `${storeId}:${categoryId}`, storeId, categoryId, status: "pending", attempts: 0,
      startedAt: null, finishedAt: null, productCount: null, rawRunDirectory: null,
      normalizedPath: null, errorName: null, errorMessage: null,
    })),
  };
  assertMagnitState(state);
  return state;
}

export class MagnitFileState implements MagnitStateSink {
  public constructor(public readonly filePath: string) {}

  public async load(): Promise<MagnitRunState> {
    const value: unknown = JSON.parse(await readFile(this.filePath, "utf8"));
    assertMagnitState(value);
    return value;
  }

  public async save(state: MagnitRunState): Promise<void> {
    assertMagnitState(state);
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", flag: "wx", flush: true });
    // A crash during writing leaves the previous complete JSON intact.
    await rename(temporaryPath, this.filePath);
  }
}

export function updateMagnitTask(state: MagnitRunState, task: CollectionTaskState): MagnitRunState {
  return { ...state, updatedAt: new Date().toISOString(), tasks: state.tasks.map((old) => old.id === task.id ? task : old) };
}

export function assertMagnitState(value: unknown): asserts value is MagnitRunState {
  const fail = (): never => { throw new Error("Некорректный файл состояния Магнита"); };
  if (!isRecord(value) || value.version !== 1 || value.chain !== "magnit" ||
    typeof value.runId !== "string" || !/^magnit_[a-z0-9-]+$/.test(value.runId) ||
    !isTimestamp(value.createdAt) || !isTimestamp(value.updatedAt) ||
    typeof value.timeZone !== "string" ||
    !["running", "paused", "completed", "completed_with_errors"].includes(String(value.status)) ||
    !Array.isArray(value.tasks) || value.tasks.length === 0) return fail();
  try { new Intl.DateTimeFormat("en", { timeZone: value.timeZone }).format(); } catch { return fail(); }
  const ids = new Set<string>();
  for (const task of value.tasks as unknown[]) {
    if (!isRecord(task) || typeof task.storeId !== "string" || !/^\d+$/.test(task.storeId) ||
      typeof task.categoryId !== "string" || !/^[1-9]\d*$/.test(task.categoryId) || !Number.isSafeInteger(Number(task.categoryId)) ||
      task.id !== `${task.storeId}:${task.categoryId}` || typeof task.id !== "string" || ids.has(task.id) ||
      !["pending", "running", "success", "failed"].includes(String(task.status)) ||
      typeof task.attempts !== "number" || !Number.isSafeInteger(task.attempts) || task.attempts < 0) return fail();
    ids.add(task.id);
    for (const field of ["startedAt", "finishedAt"] as const) {
      if (task[field] !== null && !isTimestamp(task[field])) return fail();
    }
    for (const field of ["rawRunDirectory", "normalizedPath", "errorName", "errorMessage"] as const) {
      if (task[field] !== null && typeof task[field] !== "string") return fail();
    }
    if (task.productCount !== null && (typeof task.productCount !== "number" ||
      !Number.isSafeInteger(task.productCount) || task.productCount < 0)) return fail();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
}
