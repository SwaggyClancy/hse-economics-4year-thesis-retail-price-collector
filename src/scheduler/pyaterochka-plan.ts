import { readCodeList } from "../config/code-list.js";
import type { PyaterochkaConfig } from "../config/pyaterochka-config.js";
import type { CollectionTaskInput } from "./types.js";

export async function createPyaterochkaTaskPlan(
  config: PyaterochkaConfig,
): Promise<readonly CollectionTaskInput[]> {
  if (!config.batch) {
    return [{ storeId: config.storeId, categoryId: config.categoryId }];
  }

  const [stores, categories] = await Promise.all([
    readCodeList(config.storesFile, "pyaterochka"),
    readCodeList(config.categoriesFile),
  ]);
  return stores.flatMap((storeId) => categories.map((categoryId) => ({ storeId, categoryId })));
}
