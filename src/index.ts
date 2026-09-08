import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { loadPyaterochkaConfig } from "./config/pyaterochka-config.js";
import { errorDetails, JsonLinesLogger } from "./core/logger.js";
import {
  FileRunStateStore,
  finishRun,
  prepareFailedTasks,
  prepareInterruptedTasks,
} from "./scheduler/file-run-state.js";
import { createPyaterochkaTaskPlan } from "./scheduler/pyaterochka-plan.js";
import { runPyaterochkaTasks } from "./scheduler/pyaterochka-runner.js";
import type { CollectionRunState } from "./scheduler/types.js";

async function main(): Promise<void> {
  const config = loadPyaterochkaConfig(process.argv.slice(2), process.env, process.cwd());
  if (config.dryRun) {
    if (config.setupProfile) throw new Error("dry-run не настраивает профиль");
    const restoreFile = config.resumeFile ?? config.retryFailedFile;
    const tasks = restoreFile === null
      ? await createPyaterochkaTaskPlan(config)
      : (await FileRunStateStore.load(restoreFile)).state.tasks.filter((task) =>
        config.retryFailedFile !== null ? task.status === "failed" : task.status === "pending" || task.status === "running",
      );
    console.log(JSON.stringify({ dryRun: true, chain: "pyaterochka", selectedTasks: tasks.length, preview: tasks.slice(0, 10).map(({ storeId, categoryId }) => ({ storeId, categoryId })) }, null, 2));
    return;
  }
  const logger = new JsonLinesLogger(config.logDirectory);
  await mkdir(config.profileDirectory, { recursive: true });

  if (config.setupProfile) {
    if (config.headless) throw new Error("Режим --setup-profile нельзя запускать с --headless");
    const context = await launchContext(config.profileDirectory, config.browserChannel, false);
    try {
      const page = context.pages()[0] ?? (await context.newPage());
      await page.goto("https://5ka.ru/", { waitUntil: "domcontentloaded", timeout: 60000 });
      console.log(
        "Настройте адрес и магазин в открытом Chrome, затем закройте вкладку. " +
          "Профиль сохраняется только в profiles/pyaterochka/.",
      );
      await page.waitForEvent("close", { timeout: 0 });
    } finally {
      await context.close();
    }
    return;
  }

  const context = await launchContext(config.profileDirectory, config.browserChannel, config.headless);
  try {
    const { store: stateStore, state: initialState, selectedTaskIds } = await prepareState(config);

    await logger.log("info", "pyaterochka.run.started", {
      runId: initialState.runId,
      taskCount: initialState.tasks.length,
      pendingTaskCount: initialState.tasks.filter((task) => task.status === "pending").length,
      stateFile: stateStore.filePath,
      headless: config.headless,
      browserChannel: config.browserChannel,
    });

    if (!initialState.tasks.some((task) => task.status === "pending" && (selectedTaskIds === undefined || selectedTaskIds.includes(task.id)))) {
      const finalState = finishRun(initialState);
      await stateStore.save(finalState);
      await logger.log("info", "pyaterochka.run.nothing_to_process", {
        runId: finalState.runId,
        status: finalState.status,
        stateFile: stateStore.filePath,
      });
      if (finalState.status !== "completed") process.exitCode = 1;
      return;
    }

    const page = context.pages()[0] ?? (await context.newPage());
    page.on("requestfailed", (request) => {
      const resourceType = request.resourceType();
      const requestUrl = new URL(request.url());
      if (
        ["document", "fetch", "xhr"].includes(resourceType) &&
        ["5ka.ru", "5d.5ka.ru"].includes(requestUrl.hostname)
      ) {
        void logger.log("warn", "pyaterochka.browser.request_failed", {
          method: request.method(),
          origin: requestUrl.origin,
          pathname: requestUrl.pathname,
          resourceType,
          failure: request.failure()?.errorText ?? "unknown",
        });
      }
    });

    const navigationResponse = await page.goto("https://5ka.ru/", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    const finalUrl = new URL(page.url());
    await logger.log("info", "pyaterochka.browser.ready", {
      origin: finalUrl.origin,
      pathname: finalUrl.pathname,
      navigationStatus: navigationResponse?.status() ?? null,
      title: await page.title(),
    });
    if (navigationResponse !== null && navigationResponse.status() >= 400) {
      throw new Error(`Главная страница Пятёрочки вернула HTTP ${navigationResponse.status()}`);
    }
    const finalState = await runPyaterochkaTasks(
      page,
      config,
      logger,
      stateStore,
      initialState,
      process.cwd(),
      selectedTaskIds,
    );
    await logger.log("info", "pyaterochka.run.completed", {
      runId: finalState.runId,
      status: finalState.status,
      successfulTasks: finalState.tasks.filter((task) => task.status === "success").length,
      failedTasks: finalState.tasks.filter((task) => task.status === "failed").length,
      stateFile: stateStore.filePath,
    });
    if (finalState.status !== "completed") process.exitCode = 1;
  } catch (error) {
    await logger.log("error", "pyaterochka.run.failed", {
      stateFile: config.resumeFile ?? config.retryFailedFile,
      ...errorDetails(error),
    });
    throw error;
  } finally {
    await context.close();
  }
}

async function prepareState(config: ReturnType<typeof loadPyaterochkaConfig>): Promise<{
  store: FileRunStateStore;
  state: CollectionRunState;
  selectedTaskIds?: readonly string[];
}> {
  if (config.resumeFile !== null) {
    const loaded = await FileRunStateStore.load(config.resumeFile);
    const state = prepareInterruptedTasks(loaded.state);
    await loaded.store.save(state);
    return { store: loaded.store, state };
  }
  if (config.retryFailedFile !== null) {
    const loaded = await FileRunStateStore.load(config.retryFailedFile);
    const state = prepareFailedTasks(loaded.state);
    await loaded.store.save(state);
    return { store: loaded.store, state, selectedTaskIds: loaded.state.tasks.filter((task) => task.status === "failed").map((task) => task.id) };
  }
  const tasks = await createPyaterochkaTaskPlan(config);
  return FileRunStateStore.create(config.stateDataDirectory, tasks);
}

async function launchContext(
  profileDirectory: string,
  browserChannel: "chrome" | "chromium",
  headless: boolean,
): Promise<Awaited<ReturnType<typeof chromium.launchPersistentContext>>> {
  return chromium.launchPersistentContext(profileDirectory, {
    headless,
    ...(browserChannel === "chrome" ? { channel: "chrome" } : {}),
  });
}

main().catch((error: unknown) => {
  console.error("Сбор завершился с ошибкой", errorDetails(error));
  process.exitCode = 1;
});
