import type { Logger } from "../../core/logger.js";
import { errorDetails } from "../../core/logger.js";
import { delay } from "../../core/time.js";
import { MagnitHttpResponseError } from "../../collectors/magnit/errors.js";
import type { CollectionTaskState } from "../types.js";
import { updateMagnitTask, type MagnitRunState, type MagnitStateSink } from "./state.js";

export interface MagnitTaskOutput {
  readonly productCount: number;
  readonly rawRunDirectory: string;
  readonly normalizedPath: string;
}

export type MagnitTaskExecutor = (
  task: CollectionTaskState,
  recordRawDirectory: (directory: string) => Promise<void>,
) => Promise<MagnitTaskOutput>;
export type MagnitQueueMode = "resume" | "retry-failed";

export function selectMagnitTasks(state: MagnitRunState, mode: MagnitQueueMode): readonly CollectionTaskState[] {
  return state.tasks.filter((task) => mode === "retry-failed"
    ? task.status === "failed"
    : task.status === "pending" || task.status === "running");
}

export async function runMagnitQueue(
  initial: MagnitRunState,
  sink: MagnitStateSink,
  execute: MagnitTaskExecutor,
  logger: Logger,
  mode: MagnitQueueMode,
  delayBetweenTasksMs = 3000,
): Promise<MagnitRunState> {
  let state: MagnitRunState = { ...initial, status: "running" };
  const tasks = selectMagnitTasks(state, mode);
  for (let index = 0; index < tasks.length; index += 1) {
    const selected = tasks[index];
    if (selected === undefined) continue;
    let running: CollectionTaskState = {
      ...selected, status: "running", attempts: selected.attempts + 1,
      startedAt: new Date().toISOString(), finishedAt: null, productCount: null,
      rawRunDirectory: null, normalizedPath: null, errorName: null, errorMessage: null,
    };
    state = updateMagnitTask(state, running);
    await sink.save(state);
    let paused = false;
    try {
      const output = await execute(running, async (rawRunDirectory) => {
        running = { ...running, rawRunDirectory };
        state = updateMagnitTask(state, running);
        await sink.save(state);
      });
      state = updateMagnitTask(state, { ...running, ...output, status: "success", finishedAt: new Date().toISOString() });
    } catch (error) {
      const details = errorDetails(error);
      await logger.log("error", "magnit.task.failed", { taskId: running.id, ...details });
      state = updateMagnitTask(state, {
        ...running, status: "failed", finishedAt: new Date().toISOString(),
        errorName: String(details.name), errorMessage: String(details.message),
      });
      paused = error instanceof MagnitHttpResponseError &&
        ([401, 403, 429].includes(error.status) || error.retryAfter !== null);
      // Disk errors must not turn into hundreds of doomed tasks.
      if (error instanceof Error && "code" in error && ["ENOSPC", "EACCES", "EPERM", "EROFS"].includes(String(error.code))) paused = true;
    }
    if (paused) state = { ...state, status: "paused" };
    await sink.save(state);
    if (paused) {
      await logger.log("warn", "magnit.queue.paused", { runId: state.runId, taskId: running.id });
      return state;
    }
    if (index < tasks.length - 1) await delay(delayBetweenTasksMs);
  }
  const pending = state.tasks.some((task) => task.status === "pending" || task.status === "running");
  state = {
    ...state, updatedAt: new Date().toISOString(),
    status: pending ? "paused" : state.tasks.some((task) => task.status === "failed") ? "completed_with_errors" : "completed",
  };
  await sink.save(state);
  return state;
}
