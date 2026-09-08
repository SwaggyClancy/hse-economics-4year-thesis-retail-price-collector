export interface QualityIssue {
  readonly severity: "error" | "warning";
  readonly code: string;
  count: number;
  readonly rows: number[];
}

export interface FileQuality {
  readonly file: string;
  readonly rows: number;
  readonly issues: QualityIssue[];
  readonly rawReferences: readonly string[];
  readonly identity: string | null;
  readonly runStartedAt: string | null;
}

export function addIssue(issues: QualityIssue[], code: string, severity: "error" | "warning", row?: number): void {
  let issue = issues.find((entry) => entry.code === code);
  if (!issue) { issue = { code, severity, count: 0, rows: [] }; issues.push(issue); }
  issue.count += 1;
  if (row !== undefined && issue.rows.length < 10) issue.rows.push(row);
}

export function inspectNormalized(file: string, value: unknown): FileQuality {
  const issues: QualityIssue[] = [];
  if (!isRecord(value) || !["magnit", "pyaterochka"].includes(String(value.chain)) || !Array.isArray(value.snapshots)) {
    addIssue(issues, "INVALID_ENVELOPE", "error");
    return { file, rows: 0, issues, rawReferences: [], identity: null, runStartedAt: null };
  }
  const snapshots = value.snapshots as unknown[];
  if (value.count !== snapshots.length) addIssue(issues, "COUNT_MISMATCH", "error");
  if (snapshots.length === 0) addIssue(issues, "EMPTY_CATEGORY", "warning");
  const keys = new Set<string>();
  const identities = new Set<string>();
  const runTimes = new Set<string>();
  const rawReferences = new Set<string>();
  snapshots.forEach((entry, index) => {
    const row = index + 1;
    if (!isRecord(entry)) { addIssue(issues, "INVALID_ROW", "error", row); return; }
    if (entry.chain !== value.chain) addIssue(issues, "CHAIN_MISMATCH", "error", row);
    const identityFields = [entry.chain, entry.storeId, entry.categoryId, entry.productId];
    if (!identityFields.every(nonempty)) addIssue(issues, "MISSING_ID", "error", row);
    else {
      const key = JSON.stringify(identityFields);
      if (keys.has(key)) addIssue(issues, "DUPLICATE_PRODUCT", "error", row);
      keys.add(key);
      identities.add(JSON.stringify(identityFields.slice(0, 3)));
    }
    if (!nonempty(entry.name)) addIssue(issues, "MISSING_NAME", "error", row);
    if (typeof entry.available !== "boolean") addIssue(issues, "INVALID_AVAILABILITY", "error", row);
    if (!timestamp(entry.collectedAt) || !timestamp(entry.runStartedAt)) addIssue(issues, "INVALID_TIMESTAMP", "error", row);
    else {
      runTimes.add(entry.runStartedAt);
      if (Date.parse(entry.collectedAt) < Date.parse(entry.runStartedAt)) addIssue(issues, "TIME_ORDER", "error", row);
    }
    if (typeof entry.logicalDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(entry.logicalDate) ||
      !Number.isFinite(Date.parse(entry.logicalDate)) || new Date(entry.logicalDate).toISOString().slice(0, 10) !== entry.logicalDate) {
      addIssue(issues, "INVALID_LOGICAL_DATE", "error", row);
    }
    for (const price of [entry.regularPrice, entry.discountPrice]) {
      if (price !== null && !money(price)) addIssue(issues, "INVALID_MONEY", "error", row);
      if (money(price) && price.amountMinor === 0) addIssue(issues, "ZERO_PRICE", "warning", row);
    }
    if (entry.regularPrice == null && entry.discountPrice == null) addIssue(issues, "MISSING_PRICE", "warning", row);
    if (money(entry.regularPrice) && money(entry.discountPrice) && entry.discountPrice.amountMinor > entry.regularPrice.amountMinor) {
      addIssue(issues, "DISCOUNT_ABOVE_REGULAR", "warning", row);
    }
    if (!nonempty(entry.rawReference)) addIssue(issues, "MISSING_RAW_REFERENCE", "error", row);
    else rawReferences.add(entry.rawReference);
  });
  if (identities.size > 1 || runTimes.size > 1) addIssue(issues, "MIXED_COLLECTION", "error");
  return {
    file, rows: snapshots.length, issues, rawReferences: [...rawReferences],
    identity: identities.size === 1 ? [...identities][0]! : null,
    runStartedAt: runTimes.size === 1 ? [...runTimes][0]! : null,
  };
}

export function compareCounts(files: readonly FileQuality[]): void {
  const groups = new Map<string, FileQuality[]>();
  for (const file of files) {
    if (file.identity === null || file.runStartedAt === null || file.issues.some((issue) => issue.severity === "error")) continue;
    const group = groups.get(file.identity) ?? [];
    group.push(file); groups.set(file.identity, group);
  }
  for (const group of groups.values()) {
    const times = new Map<string, FileQuality[]>();
    for (const file of group) {
      const versions = times.get(file.runStartedAt!) ?? [];
      versions.push(file); times.set(file.runStartedAt!, versions);
    }
    let previous: FileQuality | undefined;
    for (const [, versions] of [...times].sort(([left], [right]) => Date.parse(left) - Date.parse(right))) {
      if (versions.length !== 1) {
        for (const file of versions) addIssue(file.issues, "MULTIPLE_VERSIONS", "warning");
        previous = undefined; continue;
      }
      const current = versions[0]!;
      if (previous && previous.rows > 0 && current.rows < previous.rows * 0.5) addIssue(current.issues, "COUNT_DROP_OVER_50_PERCENT", "warning");
      previous = current;
    }
  }
}

function nonempty(value: unknown): value is string { return typeof value === "string" && value.trim() !== ""; }
function timestamp(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function money(value: unknown): value is { amountMinor: number } {
  return isRecord(value) && typeof value.amountMinor === "number" && Number.isSafeInteger(value.amountMinor) &&
    value.amountMinor >= 0 && value.currency === "RUB" && value.minorUnitScale === 2;
}
