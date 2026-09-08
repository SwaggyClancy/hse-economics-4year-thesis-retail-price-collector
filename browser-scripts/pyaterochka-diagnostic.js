// Run in DevTools Console on an open Pyaterochka page.
// The downloaded JSON intentionally excludes cookies, storage and sensitive headers.
(async function diagnosePyaterochkaCatalog() {
  "use strict";

  const PAGE_LIMIT = 12;
  const MAX_PAGES = 3;
  const DELAY_MS = 1500;
  const SAFE_RESPONSE_HEADERS = new Set([
    "cache-control",
    "content-length",
    "content-type",
    "date",
    "etag",
    "expires",
    "retry-after",
  ]);

  const storeId = prompt("ID магазина Пятёрочки", "324K")?.trim().toUpperCase();
  const categoryId = prompt("ID категории Пятёрочки", "251C12891")?.trim();

  if (!storeId || !categoryId) {
    console.error("Не указан магазин или категория.");
    return;
  }

  const sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds));

  function timestampForFilename() {
    return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  }

  function safeHeaders(headers) {
    return Object.fromEntries(
      [...headers.entries()].filter(([name]) => SAFE_RESPONSE_HEADERS.has(name.toLowerCase())),
    );
  }

  function describeShape(value, depth = 0) {
    if (value === null) return "null";
    if (Array.isArray(value)) {
      return {
        type: "array",
        length: value.length,
        item: value.length > 0 && depth < 4 ? describeShape(value[0], depth + 1) : null,
      };
    }
    if (typeof value !== "object") return typeof value;
    if (depth >= 4) return "object";

    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, describeShape(child, depth + 1)]),
    );
  }

  function downloadJson(filename, value) {
    const blobUrl = URL.createObjectURL(
      new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  }

  async function fetchPage(offset) {
    const url = new URL(
      `https://5d.5ka.ru/api/catalog/v2/stores/${encodeURIComponent(storeId)}` +
        `/categories/${encodeURIComponent(categoryId)}/products`,
    );
    url.search = new URLSearchParams({
      mode: "delivery",
      include_restrict: "true",
      limit: String(PAGE_LIMIT),
      offset: String(offset),
    }).toString();

    const startedAt = new Date().toISOString();
    const started = performance.now();

    try {
      const response = await fetch(url, {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      const rawBody = await response.text();
      let body;
      let bodyFormat = "json";

      try {
        body = JSON.parse(rawBody);
      } catch {
        body = rawBody.slice(0, 250000);
        bodyFormat = "text";
      }

      return {
        request: {
          method: "GET",
          url: url.toString(),
          credentialsMode: "include (cookie values not recorded)",
          headers: { Accept: "application/json" },
        },
        response: {
          receivedAt: new Date().toISOString(),
          durationMs: Math.round(performance.now() - started),
          status: response.status,
          statusText: response.statusText,
          ok: response.ok,
          redirected: response.redirected,
          type: response.type,
          headers: safeHeaders(response.headers),
          bodyFormat,
          bodyShape: describeShape(body),
          body,
        },
        startedAt,
      };
    } catch (error) {
      return {
        request: { method: "GET", url: url.toString() },
        startedAt,
        error: {
          name: error instanceof Error ? error.name : "UnknownError",
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  const pages = [];
  for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex += 1) {
    const result = await fetchPage(pageIndex * PAGE_LIMIT);
    pages.push(result);

    const response = result.response;
    const products = response?.body?.products;
    console.log(
      `Пятёрочка: страница ${pageIndex + 1}, status=${response?.status ?? "error"}, ` +
        `products=${Array.isArray(products) ? products.length : "unknown"}`,
    );

    if (!response?.ok || !Array.isArray(products) || products.length < PAGE_LIMIT) break;
    await sleep(DELAY_MS);
  }

  const log = {
    diagnosticVersion: 1,
    chain: "pyaterochka",
    collectedAt: new Date().toISOString(),
    pageContext: {
      origin: location.origin,
      pathname: location.pathname,
      userAgent: navigator.userAgent,
      language: navigator.language,
    },
    privacy: {
      cookiesRecorded: false,
      storageRecorded: false,
      sensitiveRequestHeadersRecorded: false,
    },
    input: { storeId, categoryId, pageLimit: PAGE_LIMIT, maxPages: MAX_PAGES },
    pages,
  };

  const filename = `pyaterochka_diagnostic_${storeId}_${categoryId}_${timestampForFilename()}.json`;
  downloadJson(filename, log);
  console.log(`Диагностика завершена: ${filename}`);
})();
