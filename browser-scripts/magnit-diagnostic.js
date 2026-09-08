// Run in DevTools Console on an open Magnit page.
// The downloaded JSON intentionally excludes cookies, storage and the generated device UUID.
(async function diagnoseMagnitCatalog() {
  "use strict";

  const PAGE_LIMIT = 32;
  const MAX_PAGES = 3;
  const DELAY_MS = 1500;
  const ENDPOINT = "https://magnit.ru/webgate/v2/goods/search";
  const SAFE_RESPONSE_HEADERS = new Set([
    "cache-control",
    "content-length",
    "content-type",
    "date",
    "etag",
    "expires",
    "retry-after",
  ]);

  const storeCode = prompt("storeCode магазина Магнит", "780019")?.trim();
  const categoryInput = prompt("categoryId Магнита", "64247")?.trim();
  const categoryId = Number(categoryInput);

  if (!storeCode || !categoryInput || !Number.isInteger(categoryId)) {
    console.error("Не указан магазин или categoryId не является целым числом.");
    return;
  }

  const deviceId = crypto.randomUUID();
  const requestHeaders = {
    accept: "application/json",
    "content-type": "application/json",
    "x-app-version": "2026.3.12-19.7",
    "x-client-name": "magnit",
    "x-device-id": deviceId,
    "x-device-platform": "Web",
    "x-device-tag": "disabled",
    "x-new-magnit": "true",
    "x-platform-version": "Windows Chrome 146",
  };
  const loggedRequestHeaders = {
    ...requestHeaders,
    "x-device-id": "[redacted generated UUID]",
  };

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
    const body = {
      sort: { order: "desc", type: "popularity" },
      pagination: { limit: PAGE_LIMIT, offset },
      categories: [categoryId],
      includeAdultGoods: true,
      storeCode,
      storeType: "1",
      catalogType: "1",
    };
    const startedAt = new Date().toISOString();
    const started = performance.now();

    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        credentials: "include",
        headers: requestHeaders,
        body: JSON.stringify(body),
      });
      const rawBody = await response.text();
      let responseBody;
      let bodyFormat = "json";

      try {
        responseBody = JSON.parse(rawBody);
      } catch {
        responseBody = rawBody.slice(0, 250000);
        bodyFormat = "text";
      }

      return {
        request: {
          method: "POST",
          url: ENDPOINT,
          credentialsMode: "include (cookie values not recorded)",
          headers: loggedRequestHeaders,
          body,
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
          bodyShape: describeShape(responseBody),
          body: responseBody,
        },
        startedAt,
      };
    } catch (error) {
      return {
        request: {
          method: "POST",
          url: ENDPOINT,
          headers: loggedRequestHeaders,
          body,
        },
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
    const items = response?.body?.items;
    const pagination = response?.body?.pagination;
    console.log(
      `Магнит: страница ${pageIndex + 1}, status=${response?.status ?? "error"}, ` +
        `items=${Array.isArray(items) ? items.length : "unknown"}, ` +
        `hasMore=${pagination?.hasMore ?? "unknown"}`,
    );

    if (
      !response?.ok ||
      !Array.isArray(items) ||
      !pagination?.hasMore ||
      items.length < PAGE_LIMIT
    ) {
      break;
    }
    await sleep(DELAY_MS);
  }

  const log = {
    diagnosticVersion: 1,
    chain: "magnit",
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
      generatedDeviceIdRecorded: false,
      sensitiveRequestHeadersRecorded: false,
    },
    input: { storeCode, categoryId, pageLimit: PAGE_LIMIT, maxPages: MAX_PAGES },
    pages,
  };

  const filename = `magnit_diagnostic_${storeCode}_${categoryId}_${timestampForFilename()}.json`;
  downloadJson(filename, log);
  console.log(`Диагностика завершена: ${filename}`);
})();
