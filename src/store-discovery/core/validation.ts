import type { DiscoveryManifest } from "./types.js";

export type ValidationSeverity = "error" | "warning";

export interface DiscoveryValidationIssue {
  readonly severity: ValidationSeverity;
  readonly code: string;
  readonly message: string;
  readonly storeCode: string | null;
}

export interface DiscoveryValidationResult {
  readonly valid: boolean;
  readonly storeCount: number;
  readonly activeStoreCount: number;
  readonly administrativeDistrictCoverage: number;
  readonly municipalDistrictCoverage: number;
  readonly issues: readonly DiscoveryValidationIssue[];
}

export function validateDiscoveryManifest(manifest: DiscoveryManifest): DiscoveryValidationResult {
  const issues: DiscoveryValidationIssue[] = [];
  const codes = new Set<string>();
  let administrativeDistrictCount = 0;
  let municipalDistrictCount = 0;
  let activeStoreCount = 0;

  for (const store of manifest.stores) {
    if (!store.externalCode.trim()) addIssue(issues, "error", "empty_code", "Пустой код магазина", null);
    if (codes.has(store.externalCode)) {
      addIssue(issues, "error", "duplicate_code", "Код магазина встречается повторно", store.externalCode);
    }
    codes.add(store.externalCode);
    if (!store.address.trim()) addIssue(issues, "error", "empty_address", "Пустой адрес магазина", store.externalCode);
    if (!validLatitude(store.latitude) || !validLongitude(store.longitude)) {
      addIssue(issues, "error", "invalid_coordinates", "Координаты магазина вне допустимого диапазона", store.externalCode);
    }
    if (store.administrativeDistrict === null) {
      addIssue(issues, "warning", "missing_administrative_district", "Не определён административный район", store.externalCode);
    } else {
      administrativeDistrictCount += 1;
    }
    if (store.municipalDistrict === null) {
      addIssue(issues, "warning", "missing_municipal_district", "Не определён муниципальный район", store.externalCode);
    } else {
      municipalDistrictCount += 1;
    }
    if (store.active) activeStoreCount += 1;
  }
  if (manifest.uniqueStoreCount !== manifest.stores.length) {
    addIssue(issues, "error", "count_mismatch", "uniqueStoreCount не совпадает с числом карточек", null);
  }

  return {
    valid: !issues.some((issue) => issue.severity === "error"),
    storeCount: manifest.stores.length,
    activeStoreCount,
    administrativeDistrictCoverage: coverage(administrativeDistrictCount, manifest.stores.length),
    municipalDistrictCoverage: coverage(municipalDistrictCount, manifest.stores.length),
    issues,
  };
}

function addIssue(
  issues: DiscoveryValidationIssue[],
  severity: ValidationSeverity,
  code: string,
  message: string,
  storeCode: string | null,
): void {
  issues.push({ severity, code, message, storeCode });
}

function validLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

function validLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

function coverage(count: number, total: number): number {
  return total === 0 ? 0 : Math.round(count / total * 10000) / 100;
}
