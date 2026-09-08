import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Page } from "playwright";
import { afterEach, describe, expect, it, vi } from "vitest";
import { collectPyaterochkaCategory } from "../../src/collectors/pyaterochka/collector.js";
import { HttpResponseError } from "../../src/collectors/pyaterochka/errors.js";
import { loadPyaterochkaConfig } from "../../src/config/pyaterochka-config.js";
import { FileRunStateStore } from "../../src/scheduler/file-run-state.js";
import { runPyaterochkaTasks } from "../../src/scheduler/pyaterochka-runner.js";

vi.mock("../../src/collectors/pyaterochka/collector.js", () => ({ collectPyaterochkaCategory: vi.fn() }));
const directories: string[] = [];
const logger = { log: (): Promise<void> => Promise.resolve() };

afterEach(async () => {
  vi.resetAllMocks();
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

async function setup(): Promise<{
  directory: string;
  config: ReturnType<typeof loadPyaterochkaConfig>;
  created: Awaited<ReturnType<typeof FileRunStateStore.create>>;
}> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pyat-runner-test-"));
  directories.push(directory);
  const config = { ...loadPyaterochkaConfig([], {}, directory), delayBetweenTasksMs: 0 };
  const created = await FileRunStateStore.create(config.stateDataDirectory, [
    { storeId: "324K", categoryId: "A" }, { storeId: "324K", categoryId: "B" },
  ]);
  return { directory, config, created };
}

describe("Pyaterochka runner safeguards", () => {
  it.each([403, 429])("stops the queue on HTTP %s", async (status) => {
    const { directory, config, created } = await setup();
    vi.mocked(collectPyaterochkaCategory).mockRejectedValue(new HttpResponseError(status, "blocked", null));
    const result = await runPyaterochkaTasks({} as Page, config, logger, created.store, created.state, directory);
    expect(result.status).toBe("paused");
    expect(result.tasks.map((task) => task.status)).toEqual(["failed", "pending"]);
    expect(collectPyaterochkaCategory).toHaveBeenCalledTimes(1);
    expect((await FileRunStateStore.load(created.store.filePath)).state.status).toBe("paused");
  });
  it("does not run unrelated pending tasks during retry-failed", async () => {
    const { directory, config, created } = await setup();
    vi.mocked(collectPyaterochkaCategory).mockResolvedValue({
      storeId: "324K", categoryId: "B", pages: [], products: [],
      startedAt: "2026-09-03T10:00:00.000Z", finishedAt: "2026-09-03T10:00:01.000Z",
    });
    const result = await runPyaterochkaTasks({} as Page, config, logger, created.store, created.state, directory, ["324K:B"]);
    expect(result.tasks.map((task) => task.status)).toEqual(["pending", "success"]);
    expect(result.tasks.map((task) => task.attempts)).toEqual([0, 1]);
    expect(result.status).toBe("paused");
    expect(collectPyaterochkaCategory).toHaveBeenCalledTimes(1);
  });
});
