import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  FileRunStateStore,
  finishRun,
  prepareFailedTasks,
  prepareInterruptedTasks,
  replaceTask,
} from "../../src/scheduler/file-run-state.js";

const temporaryDirectories: string[] = [];

afterEach(async (): Promise<void> => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function createState(): Promise<Awaited<ReturnType<typeof FileRunStateStore.create>>> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "retail-state-test-"));
  temporaryDirectories.push(directory);
  return FileRunStateStore.create(directory, [
    { storeId: "324K", categoryId: "A" },
    { storeId: "324K", categoryId: "B" },
  ]);
}

describe("file run state", () => {
  it("does not mark unfinished tasks as completed", async () => {
    const created = await createState();
    expect(finishRun(created.state).status).toBe("paused");
  });
  it("persists and restores an interrupted running task as pending", async () => {
    const created = await createState();
    const firstTask = created.state.tasks[0];
    expect(firstTask).toBeDefined();
    const running = replaceTask(created.state, {
      ...firstTask!,
      status: "running",
      attempts: 1,
      startedAt: "2026-09-01T10:00:00.000Z",
    });
    await created.store.save(running);

    const loaded = await FileRunStateStore.load(created.store.filePath);
    const resumed = prepareInterruptedTasks(loaded.state);

    expect(resumed.tasks[0]).toMatchObject({ status: "pending", attempts: 1 });
    expect(resumed.tasks[1]).toMatchObject({ status: "pending", attempts: 0 });
  });

  it("prepares failed tasks for retry without changing successful tasks", async () => {
    const created = await createState();
    const [firstTask, secondTask] = created.state.tasks;
    expect(firstTask).toBeDefined();
    expect(secondTask).toBeDefined();
    let state = replaceTask(created.state, {
      ...firstTask!,
      status: "success",
      attempts: 1,
      finishedAt: "2026-09-01T10:01:00.000Z",
      productCount: 10,
    });
    state = replaceTask(state, {
      ...secondTask!,
      status: "failed",
      attempts: 1,
      finishedAt: "2026-09-01T10:02:00.000Z",
      errorName: "Error",
      errorMessage: "temporary",
    });
    const finished = finishRun(state);

    const retried = prepareFailedTasks(finished);

    expect(finished.status).toBe("completed_with_errors");
    expect(retried.tasks[0]).toMatchObject({ status: "success", attempts: 1, productCount: 10 });
    expect(retried.tasks[1]).toMatchObject({ status: "pending", attempts: 1, errorMessage: null });
  });
});
