import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { filenameTimestamp } from "../core/time.js";
import type {
  CollectionRunState,
  CollectionTaskInput,
  CollectionTaskState,
  RunStatus,
} from "./types.js";

export class FileRunStateStore {
  public constructor(public readonly filePath: string) {}

  public static async create(
    stateDirectory: string,
    tasks: readonly CollectionTaskInput[],
  ): Promise<{ store: FileRunStateStore; state: CollectionRunState }> {
    const createdAt = new Date().toISOString();
    const runId = `pyaterochka_${filenameTimestamp(new Date(createdAt))}`;
    const filePath = path.join(stateDirectory, "pyaterochka", `${runId}.json`);
    const state: CollectionRunState = {
      version: 1,
      chain: "pyaterochka",
      runId,
      createdAt,
      updatedAt: createdAt,
      status: "running",
      tasks: tasks.map(createPendingTask),
    };
    const store = new FileRunStateStore(filePath);
    await store.save(state);
    return { store, state };
  }

  public static async load(filePath: string): Promise<{
    store: FileRunStateStore;
    state: CollectionRunState;
  }> {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as unknown;
    assertRunState(parsed);
    return { store: new FileRunStateStore(filePath), state: parsed };
  }

  public async save(state: CollectionRunState): Promise<void> {
    assertRunState(state);
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", flag: "wx", flush: true });
    await rename(temporary, this.filePath);
  }
}

export function prepareInterruptedTasks(state: CollectionRunState): CollectionRunState {
  return updateRun(state, "running", state.tasks.map((task) =>
    task.status === "running"
      ? { ...task, status: "pending", finishedAt: null, errorName: null, errorMessage: null }
      : task,
  ));
}

export function prepareFailedTasks(state: CollectionRunState): CollectionRunState {
  return updateRun(state, "running", state.tasks.map((task) =>
    task.status === "failed"
      ? {
          ...task,
          status: "pending",
          startedAt: null,
          finishedAt: null,
          productCount: null,
          rawRunDirectory: null,
          normalizedPath: null,
          errorName: null,
          errorMessage: null,
        }
      : task,
  ));
}

export function replaceTask(
  state: CollectionRunState,
  replacement: CollectionTaskState,
): CollectionRunState {
  return updateRun(
    state,
    state.status,
    state.tasks.map((task) => task.id === replacement.id ? replacement : task),
  );
}

export function finishRun(state: CollectionRunState): CollectionRunState {
  if (state.tasks.some((task) => task.status === "pending" || task.status === "running")) {
    return updateRun(state, "paused", state.tasks);
  }
  const status: RunStatus = state.tasks.some((task) => task.status === "failed")
    ? "completed_with_errors"
    : "completed";
  return updateRun(state, status, state.tasks);
}

function createPendingTask(input: CollectionTaskInput): CollectionTaskState {
  return {
    id: `${input.storeId}:${input.categoryId}`,
    storeId: input.storeId,
    categoryId: input.categoryId,
    status: "pending",
    attempts: 0,
    startedAt: null,
    finishedAt: null,
    productCount: null,
    rawRunDirectory: null,
    normalizedPath: null,
    errorName: null,
    errorMessage: null,
  };
}

function updateRun(
  state: CollectionRunState,
  status: RunStatus,
  tasks: readonly CollectionTaskState[],
): CollectionRunState {
  return { ...state, status, tasks, updatedAt: new Date().toISOString() };
}

function assertRunState(value: unknown): asserts value is CollectionRunState {
  if (
    typeof value !== "object" ||
    value === null ||
    !("version" in value) ||
    value.version !== 1 ||
    !("chain" in value) ||
    value.chain !== "pyaterochka" ||
    !("tasks" in value) ||
    !Array.isArray(value.tasks)
  ) {
    throw new Error("Некорректный файл состояния запуска Пятёрочки");
  }
  const record = value as Record<string, unknown>;
  if (typeof record.runId !== "string" || typeof record.updatedAt !== "string" ||
    typeof record.createdAt !== "string" || !Number.isFinite(Date.parse(record.createdAt)) ||
    !["running", "paused", "completed", "completed_with_errors"].includes(String(record.status))) {
    throw new Error("Некорректные метаданные запуска Пятёрочки");
  }
  const ids = new Set<string>();
  for (const entry of value.tasks as unknown[]) {
    if (typeof entry !== "object" || entry === null) throw new Error("Некорректное задание");
    const task = entry as Record<string, unknown>;
    if (typeof task.storeId !== "string" || !/^[a-z0-9]+$/i.test(task.storeId) ||
      typeof task.categoryId !== "string" || !/^[a-z0-9]+$/i.test(task.categoryId) ||
      typeof task.id !== "string" || task.id !== `${task.storeId}:${task.categoryId}` || ids.has(task.id) ||
      !["pending", "running", "success", "failed"].includes(String(task.status)) ||
      typeof task.attempts !== "number" || !Number.isSafeInteger(task.attempts) || task.attempts < 0) {
      throw new Error("Некорректное или повторное задание Пятёрочки");
    }
    ids.add(task.id);
  }
}
