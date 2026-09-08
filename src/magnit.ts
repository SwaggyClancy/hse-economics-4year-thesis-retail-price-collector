import { chromium } from "playwright";
import path from "node:path";
import { PlaywrightMagnitPageClient } from "./browser/magnit-page-client.js";
import { loadMagnitConfig } from "./config/magnit-config.js";
import { errorDetails, JsonLinesLogger } from "./core/logger.js";
import { createMagnitPlan } from "./scheduler/magnit/plan.js";
import { createMagnitState, MagnitFileState } from "./scheduler/magnit/state.js";
import { runMagnitQueue, selectMagnitTasks } from "./scheduler/magnit/runner.js";
import { executeMagnitTask } from "./scheduler/magnit/task.js";

async function main(): Promise<void> {
  const cwd = process.cwd();
  const config = await loadMagnitConfig(process.argv.slice(2), process.env, cwd);
  const logger = new JsonLinesLogger(config.logDirectory, "magnit");
  const restoreFile = config.resumeFile ?? config.retryFailedFile;
  const mode = config.retryFailedFile !== null ? "retry-failed" : "resume";
  const initial = config.setupProfile ? null : restoreFile !== null
    ? await new MagnitFileState(restoreFile).load()
    : createMagnitState(await createMagnitPlan(config), config.appTimeZone);
  const stateStore = initial === null ? null : new MagnitFileState(
    restoreFile ?? path.join(config.stateDataDirectory, "magnit", `${initial.runId}.json`),
  );
  if (config.dryRun && initial !== null) {
    console.log(JSON.stringify({
      dryRun: true, chain: "magnit", totalTasks: initial.tasks.length,
      selectedTasks: selectMagnitTasks(initial, mode).length,
      preview: selectMagnitTasks(initial, mode).slice(0, 10).map(({ storeId, categoryId }) => ({ storeId, categoryId })),
    }, null, 2));
    return;
  }
  try {
    const context = await chromium.launchPersistentContext(config.profileDirectory, {
      headless: config.headless,
      ...(config.browserChannel === "chrome" ? { channel: "chrome" } : {}),
    });
    try {
      // Read restored state only after acquiring the persistent browser profile.
      // A second collector cannot concurrently launch that same profile.
      const run = restoreFile !== null && stateStore !== null ? await stateStore.load() : initial;
      if (run !== null && stateStore !== null) {
        if (selectMagnitTasks(run, mode).length === 0) {
          console.log("Нет выбранных заданий; состояние не изменено", stateStore.filePath);
          return;
        }
        await stateStore.save(run);
        await logger.log("info", "magnit.run.started", {
          runId: run.runId, selectedTasks: selectMagnitTasks(run, mode).length, stateFile: stateStore.filePath,
        });
      }
      const page = context.pages()[0] ?? await context.newPage();
      const response = await page.goto("https://magnit.ru/", {
        waitUntil: "domcontentloaded", timeout: 60000,
      });
      if (response !== null && response.status() >= 400) {
        throw new Error(`Главная страница Магнита вернула HTTP ${response.status()}`);
      }
      if (new URL(page.url()).origin !== "https://magnit.ru") {
        throw new Error("Магнит перенаправил страницу на другой origin; требуется ручная проверка");
      }
      if (config.setupProfile) {
        console.log("Настройте магазин обычным интерфейсом сайта, затем закройте вкладку. Профиль: profiles/magnit/");
        await page.waitForEvent("close", { timeout: 0 });
        return;
      }
      if (run === null || stateStore === null) throw new Error("План не создан");
      const client = new PlaywrightMagnitPageClient(page);
      const finalState = await runMagnitQueue(
        run, stateStore,
        (task, recordRawDirectory) => executeMagnitTask(client, task, run, config, logger, cwd, recordRawDirectory),
        logger, mode,
      );
      await logger.log("info", "magnit.run.completed", {
        runId: finalState.runId, status: finalState.status, stateFile: stateStore.filePath,
        successfulTasks: finalState.tasks.filter((task) => task.status === "success").length,
        failedTasks: finalState.tasks.filter((task) => task.status === "failed").length,
      });
      if (finalState.status !== "completed") process.exitCode = 1;
    } finally {
      await context.close();
    }
  } catch (error) {
    await logger.log("error", "magnit.run.failed", errorDetails(error));
    throw error;
  }
}

main().catch((error: unknown) => {
  console.error("Сбор Магнита завершился с ошибкой", errorDetails(error));
  process.exitCode = 1;
});
