import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMagnitState, MagnitFileState, assertMagnitState, type MagnitRunState } from "../../src/scheduler/magnit/state.js";
import { runMagnitQueue, type MagnitTaskExecutor, type MagnitTaskOutput } from "../../src/scheduler/magnit/runner.js";
import { MagnitHttpResponseError } from "../../src/collectors/magnit/errors.js";
import { loadMagnitConfig } from "../../src/config/magnit-config.js";
import { createMagnitPlan } from "../../src/scheduler/magnit/plan.js";
import { executeMagnitTask } from "../../src/scheduler/magnit/task.js";

const directories: string[] = [];
const logger = { log: (): Promise<void> => Promise.resolve() };
const output: MagnitTaskOutput = { productCount: 1, rawRunDirectory: "raw/task", normalizedPath: "normalized/task.json" };

afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "magnit-queue-test-"));
  directories.push(directory);
  return directory;
}

function state(): MagnitRunState {
  return createMagnitState([
    { storeId: "011601", categoryId: "64247" },
    { storeId: "780019", categoryId: "64247" },
    { storeId: "780019", categoryId: "100" },
  ], "Europe/Moscow");
}

describe("Magnit queue", () => {
  it("persists running before execution, runs serially, and continues after a task error", async () => {
    const history: MagnitRunState[] = [];
    const sink = { save: (value: MagnitRunState): Promise<void> => { history.push(value); return Promise.resolve(); } };
    let active = 0;
    const execute: MagnitTaskExecutor = async (task) => {
      expect(history.at(-1)?.tasks.find((value) => value.id === task.id)?.status).toBe("running");
      active += 1;
      expect(active).toBe(1);
      await Promise.resolve();
      active -= 1;
      if (task.storeId === "011601") throw new Error("invalid category response");
      return output;
    };
    const result = await runMagnitQueue(state(), sink, execute, logger, "resume", 0);
    expect(result.status).toBe("completed_with_errors");
    expect(result.tasks.map((task) => task.status)).toEqual(["failed", "success", "success"]);
    expect(result.tasks.every((task) => task.attempts === 1)).toBe(true);
  });

  it.each([401, 403, 429])("pauses the whole queue on HTTP %s", async (status) => {
    const execute = vi.fn<MagnitTaskExecutor>().mockRejectedValue(new MagnitHttpResponseError(status, "blocked", null));
    const sink = { save: (): Promise<void> => Promise.resolve() };
    const result = await runMagnitQueue(state(), sink, execute, logger, "resume", 0);
    expect(result.status).toBe("paused");
    expect(result.tasks.map((task) => task.status)).toEqual(["failed", "pending", "pending"]);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("pauses on a server-directed wait", async () => {
    const execute = vi.fn<MagnitTaskExecutor>().mockRejectedValue(new MagnitHttpResponseError(503, "wait", "120"));
    const result = await runMagnitQueue(state(), { save: () => Promise.resolve() }, execute, logger, "resume", 0);
    expect(result.status).toBe("paused");
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("retries only failed tasks, leaving pending and successful ones untouched", async () => {
    const initial = state();
    const mixed: MagnitRunState = { ...initial, tasks: initial.tasks.map((task, index) => ({
      ...task, status: index === 0 ? "failed" : index === 1 ? "success" : "pending", attempts: index < 2 ? 1 : 0,
    })) };
    const execute = vi.fn<MagnitTaskExecutor>().mockResolvedValue(output);
    const result = await runMagnitQueue(mixed, { save: () => Promise.resolve() }, execute, logger, "retry-failed", 0);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(result.tasks.map((task) => task.status)).toEqual(["success", "success", "pending"]);
    expect(result.tasks.map((task) => task.attempts)).toEqual([2, 1, 0]);
    expect(result.status).toBe("paused");
  });

  it("does not execute a task if saving its running state fails", async () => {
    const execute = vi.fn<MagnitTaskExecutor>().mockResolvedValue(output);
    await expect(runMagnitQueue(state(), { save: () => Promise.reject(new Error("disk failure")) }, execute, logger, "resume", 0)).rejects.toThrow("disk failure");
    expect(execute).not.toHaveBeenCalled();
  });

  it("retains the raw location for a failed attempt", async () => {
    const execute: MagnitTaskExecutor = async (_task, recordRawDirectory) => {
      await recordRawDirectory("raw/failed-attempt");
      throw new MagnitHttpResponseError(403, "Forbidden", null);
    };
    const result = await runMagnitQueue(state(), { save: () => Promise.resolve() }, execute, logger, "resume", 0);
    expect(result.tasks[0]).toMatchObject({ status: "failed", rawRunDirectory: "raw/failed-attempt" });
  });

  it("loads a persisted interrupted run and skips previous successes", async () => {
    const directory = await temporaryDirectory();
    const store = new MagnitFileState(path.join(directory, "run.json"));
    const initial = state();
    const interrupted: MagnitRunState = { ...initial, tasks: initial.tasks.map((task, index) => ({
      ...task, status: index === 0 ? "success" : index === 1 ? "running" : "pending", attempts: index < 2 ? 1 : 0,
    })) };
    await store.save(interrupted);
    const execute = vi.fn<MagnitTaskExecutor>().mockResolvedValue(output);
    const result = await runMagnitQueue(await store.load(), store, execute, logger, "resume", 0);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(result.tasks.map((task) => task.attempts)).toEqual([1, 2, 1]);
    expect((await store.load()).status).toBe("completed");
    expect((await store.load()).createdAt).toBe(initial.createdAt);
  });
});

describe("Magnit state validation", () => {
  it.each([
    { chain: "pyaterochka" }, { version: 2 }, { createdAt: "bad" },
    { tasks: [null] }, { timeZone: "invalid-zone" },
  ])("rejects invalid or foreign state %j", (patch) => {
    expect(() => assertMagnitState({ ...state(), ...patch })).toThrow();
  });
  it("rejects duplicate task ids and unsafe store codes", () => {
    const initial = state();
    expect(() => assertMagnitState({ ...initial, tasks: [initial.tasks[0], initial.tasks[0]] })).toThrow();
    expect(() => createMagnitState([{ storeId: "../other", categoryId: "1" }], "Europe/Moscow")).toThrow();
  });
  it("does not replace an existing state with invalid JSON", async () => {
    const store = new MagnitFileState(path.join(await temporaryDirectory(), "run.json"));
    await store.save(state());
    const before = await readFile(store.filePath, "utf8");
    await expect(store.save({ ...state(), tasks: [] })).rejects.toThrow();
    expect(await readFile(store.filePath, "utf8")).toBe(before);
  });
});

it("builds a unique batch plan from discovery JSON and category TXT", async () => {
  const directory = await temporaryDirectory();
  await writeFile(path.join(directory, "stores.json"), JSON.stringify([
    { chain: "magnit", externalCode: "011601", active: true },
    { chain: "magnit", externalCode: "780019", active: false },
  ]));
  await writeFile(path.join(directory, "categories.txt"), "064247\n64247\n100\n");
  const config = await loadMagnitConfig(["--batch", "--stores-file", "stores.json", "--categories-file", "categories.txt", "--dry-run"], {}, directory);
  expect(await createMagnitPlan(config)).toEqual([
    { storeId: "011601", categoryId: "64247" }, { storeId: "011601", categoryId: "100" },
  ]);
});

it("runs collection → raw → normalization → state offline with the original logical date", async () => {
  const directory = await temporaryDirectory();
  const config = await loadMagnitConfig(["--store", "780019", "--category", "64247"], {}, directory);
  const initial = { ...createMagnitState([{ storeId: "780019", categoryId: "64247" }], "Europe/Moscow"), createdAt: "2026-09-01T22:00:00.000Z" };
  const store = new MagnitFileState(path.join(directory, "state.json"));
  const client = { fetchPage: (): Promise<import("../../src/browser/magnit-page-client.js").MagnitPageResponse> => Promise.resolve({
    requestedAt: "2026-09-03T12:00:00.000Z", receivedAt: "2026-09-03T12:00:00.100Z", durationMs: 100,
    url: "https://magnit.ru/webgate/v2/goods/search", status: 200, statusText: "OK", ok: true, retryAfter: null,
    body: { items: [{ id: "1", name: "Test", price: 10000, quantity: 1 }], pagination: { offset: 0, limit: 32, totalCount: 1, hasMore: false } },
  }) };
  const result = await runMagnitQueue(initial, store, (task) => executeMagnitTask(client, task, initial, config, logger, directory), logger, "resume", 0);
  expect(result.status).toBe("completed");
  const task = result.tasks[0]!;
  const normalized = JSON.parse(await readFile(task.normalizedPath!, "utf8")) as { snapshots: { logicalDate: string; collectedAt: string }[] };
  expect(normalized.snapshots[0]).toMatchObject({ logicalDate: "2026-09-02", collectedAt: "2026-09-03T12:00:00.100Z" });
  expect(await readFile(path.join(task.rawRunDirectory!, "manifest.json"), "utf8")).toContain('"productCount": 1');
  expect((await store.load()).tasks[0]?.status).toBe("success");
});
