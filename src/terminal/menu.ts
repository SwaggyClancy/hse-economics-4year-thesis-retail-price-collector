import path from "node:path";
import type { RetailChain } from "../config/code-list.js";
import { previewCommand, type CollectorCommand, type CommandPreview } from "./commands.js";
import { listRunSummaries } from "./status.js";
import { buildQualityReport, saveQualityReport } from "../quality/report.js";
import { reprocessRaw } from "../reprocessing/reprocess.js";

export interface MenuIO {
  ask(question: string): Promise<string>;
  write(message: string): void;
  run(this: void, command: CollectorCommand): Promise<number>;
}

const menu = `
Retail Collector — локальное управление
1. Проверить план без запуска
2. Собрать товары Пятёрочки
3. Собрать товары Магнита
4. Продолжить прерванный запуск
5. Повторить только неудачные задания
6. Показать состояния и пути результатов
7. Как подготовить расписание
8. Настроить отдельный профиль браузера
9. Проверить качество сохранённых данных
10. Повторно обработать raw JSON без сети
0. Выйти
`;

export async function runMenu(io: MenuIO, cwd: string): Promise<void> {
  for (;;) {
    io.write(menu);
    const choice = (await io.ask("Номер: ")).trim();
    if (choice === "0") return;
    try {
      if (choice === "10") {
        const raw = await required(io, "Каталог raw с manifest.json: ");
        const state = (await io.ask("Файл состояния Магнита для исходной даты (Enter — без него): ")).trim().replace(/^"(.*)"$/, "$1") || undefined;
        const result = await reprocessRaw(cwd, raw, false, "Europe/Moscow", state);
        io.write(JSON.stringify(result, null, 2));
        if ((await io.ask("Сохранить новую версию? Введите ДА (Enter — отмена): ")).trim().toUpperCase() === "ДА") {
          io.write(JSON.stringify(await reprocessRaw(cwd, raw, true, "Europe/Moscow", state), null, 2));
        }
        continue;
      }
      if (choice === "9") {
        const report = await buildQualityReport(cwd);
        const directory = await saveQualityReport(cwd, report);
        io.write(JSON.stringify(report.summary, null, 2));
        io.write(`Отчёты JSON и Markdown: ${directory}`);
        continue;
      }
      if (choice === "6") {
        const summaries = await listRunSummaries(path.resolve(cwd, process.env.STATE_DATA_DIR ?? "data/state"));
        io.write(summaries.length === 0 ? "Запусков ещё нет." : JSON.stringify(summaries.slice(0, 30), null, 2));
        io.write("Raw: data/raw; результаты: data/normalized; ошибки: logs. Путь каждого задания есть в файле состояния.");
        continue;
      }
      if (choice === "7") {
        io.write(`Инструкция: ${path.join(cwd, "docs/RUN_DAILY.md")}\nРасписание не включено автоматически. Сначала выберите файлы и время.`);
        continue;
      }
      if (!["1", "2", "3", "4", "5", "8"].includes(choice)) {
        io.write("Введите номер из меню."); continue;
      }
      const chain = choice === "2" ? "pyaterochka" : choice === "3" ? "magnit" : await askChain(io);
      let command: CollectorCommand;
      if (choice === "8") {
        command = { chain, args: ["--setup-profile", "--headed"] };
        io.write(`Откроется отдельный профиль ${chain}; основной Chrome не используется.`);
      } else {
        command = choice === "4" || choice === "5"
          ? { chain, args: [choice === "4" ? "--resume" : "--retry-failed", await required(io, "Путь к файлу состояния: "), "--headless"] }
          : await askCollection(io, chain);
        const preview = await previewCommand(command, cwd);
        printPreview(io, preview);
        if (choice === "1" || preview.taskCount === 0) continue;
      }
      if ((await io.ask("Для запуска введите ДА (Enter — отмена): ")).trim().toUpperCase() !== "ДА") {
        io.write("Запуск отменён."); continue;
      }
      const code = await io.run(command);
      io.write(code === 0 ? "Команда завершена успешно." : `Команда завершена с кодом ${code}. Проверьте состояние и журнал.`);
    } catch (error) {
      io.write(`Ошибка: ${error instanceof Error ? error.message : "неизвестная ошибка"}`);
    }
  }
}

async function askChain(io: MenuIO): Promise<RetailChain> {
  const choice = (await io.ask("Сеть: 1 — Пятёрочка, 2 — Магнит: ")).trim();
  if (choice === "1") return "pyaterochka";
  if (choice === "2") return "magnit";
  throw new Error("Неизвестная сеть");
}

async function askCollection(io: MenuIO, chain: RetailChain): Promise<CollectorCommand> {
  const mode = (await io.ask("Режим: 1 — один магазин/категория, 2 — файлы списка: ")).trim();
  if (mode === "1") return { chain, args: [
    "--store", await required(io, "Код магазина: "),
    "--category", await required(io, "Код категории: "), "--headless",
  ] };
  if (mode === "2") return { chain, args: [
    "--batch", "--stores-file", await required(io, "Файл магазинов (JSON/TXT): "),
    "--categories-file", await required(io, "Файл категорий (JSON/TXT): "), "--headless",
  ] };
  throw new Error("Неизвестный режим");
}

async function required(io: MenuIO, question: string): Promise<string> {
  const value = (await io.ask(question)).trim().replace(/^"(.*)"$/, "$1");
  if (!value) throw new Error("Пустое значение; операция отменена");
  return value;
}

function printPreview(io: MenuIO, preview: CommandPreview): void {
  io.write(`Сеть: ${preview.chain}; магазинов: ${preview.stores}; категорий: ${preview.categories}; заданий: ${preview.taskCount}.`);
  io.write(JSON.stringify(preview.firstTasks, null, 2));
}
