import path from "node:path";

export interface PyaterochkaConfig {
  readonly storeId: string;
  readonly categoryId: string;
  readonly headless: boolean;
  readonly browserChannel: "chrome" | "chromium";
  readonly setupProfile: boolean;
  readonly batch: boolean;
  readonly dryRun: boolean;
  readonly storesFile: string;
  readonly categoriesFile: string;
  readonly resumeFile: string | null;
  readonly retryFailedFile: string | null;
  readonly profileDirectory: string;
  readonly rawDataDirectory: string;
  readonly normalizedDataDirectory: string;
  readonly logDirectory: string;
  readonly stateDataDirectory: string;
  readonly appTimeZone: string;
  readonly pageLimit: number;
  readonly maximumPages: number;
  readonly minimumPageDelayMs: number;
  readonly maximumPageDelayMs: number;
  readonly maxAttempts: number;
  readonly delayBetweenTasksMs: number;
}

interface ParsedArguments {
  readonly dryRun?: boolean;
  readonly store?: string;
  readonly category?: string;
  readonly headless?: boolean;
  readonly browserChannel?: "chrome" | "chromium";
  readonly setupProfile?: boolean;
  readonly batch?: boolean;
  readonly storesFile?: string;
  readonly categoriesFile?: string;
  readonly resumeFile?: string;
  readonly retryFailedFile?: string;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`Ожидалось true или false, получено: ${value}`);
}

function parseArguments(arguments_: readonly string[]): ParsedArguments {
  const result: {
    dryRun?: boolean;
    store?: string;
    category?: string;
    headless?: boolean;
    browserChannel?: "chrome" | "chromium";
    setupProfile?: boolean;
    batch?: boolean;
    storesFile?: string;
    categoriesFile?: string;
    resumeFile?: string;
    retryFailedFile?: string;
  } = {};

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--") continue;
    if (argument === "--dry-run") result.dryRun = true;
    else if (argument === "--headless") result.headless = true;
    else if (argument === "--headed") result.headless = false;
    else if (argument === "--setup-profile") result.setupProfile = true;
    else if (argument === "--batch") result.batch = true;
    else if (argument === "--store") {
      const value = arguments_[index += 1];
      if (value === undefined) throw new Error("После --store требуется код магазина");
      result.store = value;
    } else if (argument === "--category") {
      const value = arguments_[index += 1];
      if (value === undefined) throw new Error("После --category требуется код категории");
      result.category = value;
    } else if (argument === "--browser-channel") {
      const value = arguments_[index += 1];
      if (value !== "chrome" && value !== "chromium") {
        throw new Error("После --browser-channel требуется chrome или chromium");
      }
      result.browserChannel = value;
    } else if (argument === "--stores-file") {
      const value = arguments_[index += 1];
      if (value === undefined) throw new Error("После --stores-file требуется путь");
      result.storesFile = value;
    } else if (argument === "--categories-file") {
      const value = arguments_[index += 1];
      if (value === undefined) throw new Error("После --categories-file требуется путь");
      result.categoriesFile = value;
    } else if (argument === "--resume") {
      const value = arguments_[index += 1];
      if (value === undefined) throw new Error("После --resume требуется путь к состоянию запуска");
      result.resumeFile = value;
    } else if (argument === "--retry-failed") {
      const value = arguments_[index += 1];
      if (value === undefined) throw new Error("После --retry-failed требуется путь к состоянию запуска");
      result.retryFailedFile = value;
    }
    else throw new Error(`Неизвестный аргумент: ${String(argument)}`);
  }

  return result;
}

export function loadPyaterochkaConfig(
  arguments_: readonly string[],
  environment: NodeJS.ProcessEnv,
  workingDirectory: string,
): PyaterochkaConfig {
  const parsed = parseArguments(arguments_);
  const storeId = parsed.store ?? environment.PYATEROCHKA_STORE ?? "3448";
  const categoryId = parsed.category ?? environment.PYATEROCHKA_CATEGORY ?? "251C12887";
  const headless = parsed.headless ?? parseBoolean(environment.HEADLESS, false);
  const configuredChannel = parsed.browserChannel ?? environment.BROWSER_CHANNEL ?? "chrome";
  if (configuredChannel !== "chrome" && configuredChannel !== "chromium") {
    throw new Error("BROWSER_CHANNEL должен быть chrome или chromium");
  }

  if (!storeId.trim() || !categoryId.trim()) throw new Error("Коды магазина и категории обязательны");
  if (!/^[a-z0-9]+$/i.test(storeId.trim()) || !/^[a-z0-9]+$/i.test(categoryId.trim())) {
    throw new Error("Коды магазина и категории должны состоять из латинских букв и цифр");
  }
  if (parsed.resumeFile !== undefined && parsed.retryFailedFile !== undefined) {
    throw new Error("--resume и --retry-failed нельзя использовать одновременно");
  }

  return {
    storeId: storeId.trim().toUpperCase(),
    categoryId: categoryId.trim(),
    headless,
    browserChannel: configuredChannel,
    setupProfile: parsed.setupProfile ?? false,
    batch: parsed.batch ?? false,
    dryRun: parsed.dryRun ?? false,
    storesFile: path.resolve(
      workingDirectory,
      parsed.storesFile ?? "config/stores.pyaterochka.json",
    ),
    categoriesFile: path.resolve(
      workingDirectory,
      parsed.categoriesFile ?? "config/categories.pyaterochka.json",
    ),
    resumeFile: parsed.resumeFile ? path.resolve(workingDirectory, parsed.resumeFile) : null,
    retryFailedFile: parsed.retryFailedFile
      ? path.resolve(workingDirectory, parsed.retryFailedFile)
      : null,
    profileDirectory: path.resolve(workingDirectory, "profiles", "pyaterochka"),
    rawDataDirectory: path.resolve(workingDirectory, environment.RAW_DATA_DIR ?? "data/raw"),
    normalizedDataDirectory: path.resolve(
      workingDirectory,
      environment.NORMALIZED_DATA_DIR ?? "data/normalized",
    ),
    logDirectory: path.resolve(workingDirectory, environment.LOG_DIR ?? "logs"),
    stateDataDirectory: path.resolve(
      workingDirectory,
      environment.STATE_DATA_DIR ?? "data/state",
    ),
    appTimeZone: environment.APP_TIMEZONE ?? "Europe/Moscow",
    pageLimit: 12,
    maximumPages: 500,
    minimumPageDelayMs: 1500,
    maximumPageDelayMs: 3500,
    maxAttempts: 3,
    delayBetweenTasksMs: 3000,
  };
}
