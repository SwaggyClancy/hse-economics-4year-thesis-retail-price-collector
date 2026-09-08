import path from "node:path";
import { parseArgs } from "node:util";
import { readCodeList } from "./code-list.js";

export interface MagnitConfig {
  readonly storeCode: string;
  readonly categoryId: number;
  readonly headless: boolean;
  readonly setupProfile: boolean;
  readonly browserChannel: "chrome" | "chromium";
  readonly profileDirectory: string;
  readonly rawDataDirectory: string;
  readonly normalizedDataDirectory: string;
  readonly logDirectory: string;
  readonly appTimeZone: string;
  readonly batch: boolean;
  readonly dryRun: boolean;
  readonly storesFile: string | null;
  readonly categoriesFile: string | null;
  readonly resumeFile: string | null;
  readonly retryFailedFile: string | null;
  readonly stateDataDirectory: string;
}

export async function loadMagnitConfig(
  args: readonly string[],
  environment: NodeJS.ProcessEnv,
  workingDirectory: string,
): Promise<MagnitConfig> {
  const { values } = parseArgs({
    args: [...args].filter((arg) => arg !== "--"),
    options: {
      store: { type: "string" }, category: { type: "string" },
      "stores-file": { type: "string" }, "browser-channel": { type: "string" },
      headless: { type: "boolean" }, headed: { type: "boolean" },
      "setup-profile": { type: "boolean" },
      batch: { type: "boolean" }, "dry-run": { type: "boolean" },
      "categories-file": { type: "string" }, resume: { type: "string" },
      "retry-failed": { type: "string" },
    },
    strict: true,
    allowPositionals: false,
  });
  if (values.headless && values.headed) throw new Error("Выберите --headless или --headed");
  const setupProfile = values["setup-profile"] ?? false;
  const batch = values.batch ?? false;
  const restoring = values.resume !== undefined || values["retry-failed"] !== undefined;
  if ([setupProfile, batch, values.resume !== undefined, values["retry-failed"] !== undefined].filter(Boolean).length > 1) {
    throw new Error("Режимы setup-profile, batch, resume и retry-failed несовместимы");
  }
  if ((restoring || setupProfile) && [values.store, values.category, values["stores-file"], values["categories-file"]].some((value) => value !== undefined)) {
    throw new Error("В этом режиме нельзя переопределять магазины и категории");
  }
  if (batch && (values.store !== undefined || values.category !== undefined)) {
    throw new Error("Для batch используйте файлы вместо --store/--category");
  }
  if (batch && (!values["stores-file"] || !values["categories-file"])) {
    throw new Error("Для --batch нужны --stores-file и --categories-file");
  }
  if (!batch && values["categories-file"] !== undefined) throw new Error("categories-file требует --batch");
  if (setupProfile && values["dry-run"]) throw new Error("dry-run не настраивает профиль");
  const storeCode = (values.store ?? environment.MAGNIT_STORE ?? "").trim();
  const category = (values.category ?? environment.MAGNIT_CATEGORY ?? "").trim();
  const categoryId = Number(category);
  if (!setupProfile && !batch && !restoring && (!/^\d+$/.test(storeCode) || !/^\d+$/.test(category) ||
    !Number.isSafeInteger(categoryId) || categoryId <= 0)) {
    throw new Error("Укажите --store и --category: один магазин и одну числовую категорию");
  }
  if (!batch && !restoring && values["stores-file"] !== undefined) {
    const codes = await readCodeList(path.resolve(workingDirectory, values["stores-file"]), "magnit");
    if (!codes.includes(storeCode)) throw new Error("Выбранный магазин отсутствует в активном списке");
  }
  const channel = values["browser-channel"] ?? environment.BROWSER_CHANNEL ?? "chrome";
  if (channel !== "chrome" && channel !== "chromium") throw new Error("Некорректный browser-channel");
  if (environment.HEADLESS !== undefined && !["true", "false"].includes(environment.HEADLESS)) {
    throw new Error("HEADLESS должен быть true или false");
  }
  const headless = values.headless ?? (values.headed ? false : environment.HEADLESS === "true");
  if (setupProfile && headless) throw new Error("Настройка профиля требует видимого браузера");
  const appTimeZone = environment.APP_TIMEZONE ?? "Europe/Moscow";
  new Intl.DateTimeFormat("en", { timeZone: appTimeZone }).format();
  return {
    storeCode, categoryId, headless, setupProfile, browserChannel: channel,
    profileDirectory: path.resolve(workingDirectory, "profiles/magnit"),
    rawDataDirectory: path.resolve(workingDirectory, environment.RAW_DATA_DIR ?? "data/raw"),
    normalizedDataDirectory: path.resolve(workingDirectory, environment.NORMALIZED_DATA_DIR ?? "data/normalized"),
    logDirectory: path.resolve(workingDirectory, environment.LOG_DIR ?? "logs"),
    appTimeZone,
    batch, dryRun: values["dry-run"] ?? false,
    storesFile: values["stores-file"] ? path.resolve(workingDirectory, values["stores-file"]) : null,
    categoriesFile: values["categories-file"] ? path.resolve(workingDirectory, values["categories-file"]) : null,
    resumeFile: values.resume ? path.resolve(workingDirectory, values.resume) : null,
    retryFailedFile: values["retry-failed"] ? path.resolve(workingDirectory, values["retry-failed"]) : null,
    stateDataDirectory: path.resolve(workingDirectory, environment.STATE_DATA_DIR ?? "data/state"),
  };
}
