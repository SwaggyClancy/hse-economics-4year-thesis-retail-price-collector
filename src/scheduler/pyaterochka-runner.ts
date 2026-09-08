import type { Page } from "playwright";
import { PlaywrightPyaterochkaPageClient } from "../browser/pyaterochka-page-client.js";
import { collectPyaterochkaCategory } from "../collectors/pyaterochka/collector.js";
import { HttpResponseError } from "../collectors/pyaterochka/errors.js";
import { PyaterochkaRawStorage } from "../collectors/pyaterochka/raw-storage.js";
import type { PyaterochkaConfig } from "../config/pyaterochka-config.js";
import type { Logger } from "../core/logger.js";
import { errorDetails } from "../core/logger.js";
import { delay } from "../core/time.js";
import { normalizePyaterochkaCollection } from "../normalizers/pyaterochka/normalizer.js";
import { writeNormalizedPyaterochkaCollection } from "../normalizers/pyaterochka/storage.js";
import { FileRunStateStore, finishRun, replaceTask } from "./file-run-state.js";
import type { CollectionRunState, CollectionTaskState } from "./types.js";

export async function runPyaterochkaTasks(
  page: Page,
  config: PyaterochkaConfig,
  logger: Logger,
  stateStore: FileRunStateStore,
  initialState: CollectionRunState,
  projectDirectory: string,
  selectedTaskIds?: readonly string[],
): Promise<CollectionRunState> {
  let state = initialState;
  const pendingTasks = state.tasks.filter((task) => task.status === "pending" && (selectedTaskIds === undefined || selectedTaskIds.includes(task.id)));

  for (let index = 0; index < pendingTasks.length; index += 1) {
    const task = pendingTasks[index];
    if (task === undefined) continue;
    const runningTask: CollectionTaskState = {
      ...task,
      status: "running",
      attempts: task.attempts + 1,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      errorName: null,
      errorMessage: null,
    };
    state = replaceTask(state, runningTask);
    await stateStore.save(state);

    const completedTask = await executeTask(page, config, logger, runningTask, projectDirectory);
    state = replaceTask(state, completedTask.task);
    if (completedTask.stopQueue) state = { ...state, status: "paused" };
    await stateStore.save(state);
    if (completedTask.stopQueue) return state;

    if (index < pendingTasks.length - 1) await delay(config.delayBetweenTasksMs);
  }

  state = finishRun(state);
  await stateStore.save(state);
  return state;
}

async function executeTask(
  page: Page,
  config: PyaterochkaConfig,
  logger: Logger,
  task: CollectionTaskState,
  projectDirectory: string,
): Promise<{ task: CollectionTaskState; stopQueue: boolean }> {
  const storage = await PyaterochkaRawStorage.create(
    config.rawDataDirectory,
    task.storeId,
    task.categoryId,
    new Date(),
  );
  await logger.log("info", "pyaterochka.task.started", {
    taskId: task.id,
    attempt: task.attempts,
    rawRunDirectory: storage.runDirectory,
  });

  try {
    const client = new PlaywrightPyaterochkaPageClient(page);
    const result = await collectPyaterochkaCategory(client, storage, logger, {
      storeId: task.storeId,
      categoryId: task.categoryId,
      pageLimit: config.pageLimit,
      maximumPages: config.maximumPages,
      minimumPageDelayMs: config.minimumPageDelayMs,
      maximumPageDelayMs: config.maximumPageDelayMs,
      maxAttempts: config.maxAttempts,
    });
    await storage.writeManifest(result);
    const snapshots = normalizePyaterochkaCollection(
      result,
      storage.runDirectory,
      projectDirectory,
      config.appTimeZone,
    );
    const normalizedPath = await writeNormalizedPyaterochkaCollection(
      config.normalizedDataDirectory,
      storage.runDirectory,
      snapshots,
    );
    await logger.log("info", "pyaterochka.task.completed", {
      taskId: task.id,
      pageCount: result.pages.length,
      productCount: result.products.length,
      normalizedPath,
    });
    return { stopQueue: false, task: {
      ...task,
      status: "success",
      finishedAt: new Date().toISOString(),
      productCount: result.products.length,
      rawRunDirectory: storage.runDirectory,
      normalizedPath,
      errorName: null,
      errorMessage: null,
    } };
  } catch (error) {
    try {
      await storage.writeFailure(error);
    } catch (storageError) {
      await logger.log("error", "pyaterochka.failure_file.write_failed", {
        taskId: task.id,
        ...errorDetails(storageError),
      });
    }
    const details = errorDetails(error);
    await logger.log("error", "pyaterochka.task.failed", {
      taskId: task.id,
      attempt: task.attempts,
      rawRunDirectory: storage.runDirectory,
      ...details,
    });
    return { stopQueue: error instanceof HttpResponseError && ([401, 403, 429].includes(error.status) || error.retryAfter !== null), task: {
      ...task,
      status: "failed",
      finishedAt: new Date().toISOString(),
      productCount: null,
      rawRunDirectory: storage.runDirectory,
      normalizedPath: null,
      errorName: String(details.name),
      errorMessage: String(details.message),
    } };
  }
}
