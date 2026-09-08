import type { MagnitPageClient } from "../../browser/magnit-page-client.js";
import { collectMagnitCategory } from "../../collectors/magnit/collector.js";
import { MagnitRawStorage } from "../../collectors/magnit/raw-storage.js";
import type { MagnitConfig } from "../../config/magnit-config.js";
import { errorDetails, type Logger } from "../../core/logger.js";
import { normalizeMagnitCollection } from "../../normalizers/magnit/normalizer.js";
import { writeNormalizedMagnitCollection } from "../../normalizers/magnit/storage.js";
import type { CollectionTaskState } from "../types.js";
import type { MagnitTaskOutput } from "./runner.js";
import type { MagnitRunState } from "./state.js";

export async function executeMagnitTask(
  client: MagnitPageClient, task: CollectionTaskState, run: MagnitRunState,
  config: MagnitConfig, logger: Logger, cwd: string,
  recordRawDirectory?: (directory: string) => Promise<void>,
): Promise<MagnitTaskOutput> {
  const storage = await MagnitRawStorage.create(config.rawDataDirectory, task.storeId, Number(task.categoryId), new Date());
  await recordRawDirectory?.(storage.runDirectory);
  await logger.log("info", "magnit.task.started", { runId: run.runId, taskId: task.id, attempt: task.attempts, rawRunDirectory: storage.runDirectory });
  try {
    const result = await collectMagnitCategory(client, storage, logger, {
      storeCode: task.storeId, categoryId: Number(task.categoryId),
      pageLimit: 32, maximumPages: 100, maxAttempts: 3,
      minimumPageDelayMs: 1500, maximumPageDelayMs: 3500,
    });
    await storage.writeManifest(result);
    const snapshots = normalizeMagnitCollection({ ...result, startedAt: run.createdAt }, storage.runDirectory, cwd, run.timeZone);
    const normalizedPath = await writeNormalizedMagnitCollection(config.normalizedDataDirectory, storage.runDirectory, snapshots, run.createdAt, run.timeZone);
    await logger.log("info", "magnit.task.completed", { taskId: task.id, productCount: snapshots.length, normalizedPath });
    return { productCount: snapshots.length, rawRunDirectory: storage.runDirectory, normalizedPath };
  } catch (error) {
    try { await storage.writeFailure(error); } catch (storageError) {
      await logger.log("error", "magnit.failure_file.write_failed", errorDetails(storageError));
    }
    throw error;
  }
}
