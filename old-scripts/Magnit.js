// =============================================================================
// СКРИПТ МАССОВОГО СБОРА ТОВАРОВ ИЗ МАГНИТА (несколько магазинов + несколько категорий)
// Автор: Clancy
// Для курсовой: собираем данные сразу по нескольким точкам и разделам
// =============================================================================
(async function aggregateMagnitProducts() {
  console.log(
    "%c🛠️ Старт массового сбора данных из Магнита",
    "color: #0066cc; font-weight: bold; font-size: 1.1em;",
  );

  // ──────────────────────────────────────────────────────────────
  // 1. ВВОД ДАННЫХ ОТ ПОЛЬЗОВАТЕЛЯ
  // ──────────────────────────────────────────────────────────────

  const storesInput = prompt(
    "Введи storeCode магазинов через запятую\n" +
      "Пример: 780019,729927,123456",
  );
  const categoriesInput = prompt(
    "Введи categoryId через запятую\n" + "Пример: 64247,41187,12345",
  );

  if (!storesInput || !categoriesInput) {
    console.error(
      "%c❌ Не введены магазины или категории — выхожу",
      "color: #cc0000; font-weight: bold;",
    );
    return;
  }

  const storeCodes = storesInput
    .trim()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const categoryIds = categoriesInput
    .trim()
    .split(",")
    .map((c) => parseInt(c.trim()))
    .filter((n) => !isNaN(n));

  console.log(
    `%c📋 Буду собирать данные для ${storeCodes.length} магазинов и ${categoryIds.length} категорий`,
    "color: #006600;",
  );
  console.log(`%cМагазины: ${storeCodes.join(", ")}`, "color: #444;");
  console.log(`%cКатегории: ${categoryIds.join(", ")}`, "color: #444;");

  // ──────────────────────────────────────────────────────────────
  // 2. Основные настройки
  // ──────────────────────────────────────────────────────────────

  const LIMIT_PER_REQUEST = 32;
  const MIN_DELAY_MS = 1200;
  const MAX_DELAY_MS = 3500;
  const DELAY_BETWEEN_COMBOS = 3000;
  const MAX_RETRIES = 2;
  const today = new Date().toISOString().slice(0, 10);

  let stats = []; // ← НОВАЯ структура для всех результатов

  // ──────────────────────────────────────────────────────────────
  // 3. Headers
  // ──────────────────────────────────────────────────────────────

  const deviceId = crypto.randomUUID();
  const headers = {
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

  console.log(
    `%c🔑 Подготовлены headers (device-id: ${deviceId.slice(0, 8)}...)`,
    "color: #555; font-style: italic;",
  );

  // ──────────────────────────────────────────────────────────────
  // 4. Функция одного запроса (без изменений)
  // ──────────────────────────────────────────────────────────────

  async function fetchPage(storeCode, categoryId, offset, attempt = 0) {
    const body = {
      sort: { order: "desc", type: "popularity" },
      pagination: { limit: LIMIT_PER_REQUEST, offset },
      categories: [categoryId],
      includeAdultGoods: true,
      storeCode,
      storeType: "1",
      catalogType: "1",
    };

    try {
      const resp = await fetch("https://magnit.ru/webgate/v2/goods/search", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        credentials: "include",
      });

      if (!resp.ok) {
        if (resp.status === 503 && attempt < MAX_RETRIES) {
          throw new Error(`HTTP 503 - сервис недоступен`);
        }
        throw new Error(`HTTP ${resp.status}`);
      }

      return await resp.json();
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        console.warn(
          `%c⚠️ Ошибка запроса [${storeCode}/${categoryId}] offset=${offset} (попытка ${attempt + 1}): ${err.message}`,
          "color: #cc6600;",
        );
        await new Promise((r) => setTimeout(r, 7000));
        return fetchPage(storeCode, categoryId, offset, attempt + 1);
      }
      throw err;
    }
  }

  // ──────────────────────────────────────────────────────────────
  // 5. Главная функция сбора (логика сбора НЕ ИЗМЕНЕНА)
  // ──────────────────────────────────────────────────────────────

  async function collectFor(storeCode, categoryId) {
    console.log(
      `\n%c→ Начинаю сбор: магазин ${storeCode} | категория ${categoryId}`,
      "color: #0066cc; font-weight: bold;",
    );

    let allProducts = [];
    let offset = 0;
    let totalCount = null;
    let page = 1;
    let attempt = 0;

    while (attempt <= MAX_RETRIES) {
      try {
        while (true) {
          console.log(
            `%c  Запрос #${page} | offset ${offset} (попытка ${attempt + 1})`,
            "color: #888;",
          );

          const data = await fetchPage(storeCode, categoryId, offset, attempt);

          if (!data?.items || !data?.pagination) {
            console.error(
              "%c  Нет items или pagination — прерываю категорию",
              "color: #cc0000;",
            );
            break;
          }

          const count = data.items.length;
          console.log(`%c  Получено ${count} товаров`, "color: #006600;");

          allProducts.push(...data.items);

          totalCount = data.pagination.totalCount ?? totalCount;

          if (!data.pagination.hasMore || count < LIMIT_PER_REQUEST) {
            console.log(
              `%c  Конец категории (hasMore=false или получено меньше ${LIMIT_PER_REQUEST})`,
              "color: #006600;",
            );
            break;
          }

          offset += LIMIT_PER_REQUEST;
          page++;

          const delay = Math.floor(
            MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1),
          );
          console.log(
            `%c  Пауза ${Math.round(delay / 100) / 10} сек...`,
            "color: #777; font-style: italic;",
          );
          await new Promise((r) => setTimeout(r, delay));
        }

        break;
      } catch (err) {
        attempt++;
        console.warn(
          `%c⚠️ Критическая ошибка [${storeCode}/${categoryId}] (попытка ${attempt}/${MAX_RETRIES + 1}): ${err.message}`,
          "color: #cc6600;",
        );

        if (attempt > MAX_RETRIES) {
          console.error(
            `%c❌ Не удалось собрать после ${MAX_RETRIES + 1} попыток`,
            "color: #cc0000; font-weight: bold;",
          );
          break;
        }

        await new Promise((r) => setTimeout(r, 10000));
      }
    }

    // ───── Сохранение JSON (без изменений) ─────
    if (allProducts.length > 0) {
      const filename = `magnit_${storeCode}_${categoryId}_${today}.json`;
      const blob = new Blob([JSON.stringify(allProducts, null, 2)], {
        type: "application/json",
      });
      const urlBlob = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = urlBlob;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(urlBlob);

      console.log(
        `%c✓ Сохранено: ${filename} (${allProducts.length} товаров)`,
        "color: #006600; font-weight: bold;",
      );

      if (totalCount !== null) {
        const match =
          allProducts.length === totalCount
            ? "совпадает ✅"
            : "не совпадает ⚠️";
        console.log(
          `%c  Итого: ${allProducts.length} из ${totalCount} (${match})`,
          "color: #444;",
        );
      }
    } else if (attempt > MAX_RETRIES) {
      console.warn(
        `%c⚠️ Ничего не собрано для ${storeCode}/${categoryId}`,
        "color: #cc6600;",
      );
    }

    // ← НОВОЕ: сохраняем статистику для TXT-отчётов
    const attemptsUsed = attempt > MAX_RETRIES ? MAX_RETRIES + 1 : attempt + 1;
    stats.push({
      storeCode,
      categoryId,
      collected: allProducts.length,
      attempts: attemptsUsed,
      hasError: attempt > 0 || allProducts.length === 0,
    });
  }

  // ──────────────────────────────────────────────────────────────
  // 6. Запускаем сбор (без изменений)
  // ──────────────────────────────────────────────────────────────

  for (const store of storeCodes) {
    for (const cat of categoryIds) {
      await collectFor(store, cat);

      if (storeCodes.length * categoryIds.length > 1) {
        console.log(
          `%c  Пауза между комбинациями ~${DELAY_BETWEEN_COMBOS / 1000} сек...`,
          "color: #777; font-style: italic;",
        );
        await new Promise((r) => setTimeout(r, DELAY_BETWEEN_COMBOS));
      }
    }
  }

  // ──────────────────────────────────────────────────────────────
  // 7. НОВЫЙ ФИНАЛЬНЫЙ ОТЧЁТ (TXT-файлы)
  // ──────────────────────────────────────────────────────────────

  console.log(
    "\n%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "color: #0066cc;",
  );

  if (stats.length === 0) {
    console.log("%cНет данных для отчёта", "color: #cc0000;");
    return;
  }

  // Группируем по магазинам
  const storeGroups = {};
  stats.forEach((s) => {
    if (!storeGroups[s.storeCode]) storeGroups[s.storeCode] = [];
    storeGroups[s.storeCode].push(s);
  });

  let totalAll = 0;
  const reportLines = [`Отчёт по сбору данных Магнит — ${today}\n`];

  Object.keys(storeGroups).forEach((storeCode) => {
    const group = storeGroups[storeCode];
    let storeTotal = 0;

    reportLines.push(`Магазин: ${storeCode}`);

    group.forEach((item) => {
      reportLines.push(
        `  Категория ${item.categoryId}: ${item.collected} товаров`,
      );
      storeTotal += item.collected;
    });

    reportLines.push(`  ИТОГО по магазину: ${storeTotal} товаров\n`);
    totalAll += storeTotal;
  });

  reportLines.push(`ОБЩИЙ ИТОГ: ${totalAll} товаров`);

  // ───── 1. Основной отчёт (всегда) ─────
  const mainReport = reportLines.join("\n");
  const mainBlob = new Blob([mainReport], { type: "text/plain" });
  const mainUrl = URL.createObjectURL(mainBlob);
  const mainA = document.createElement("a");
  mainA.href = mainUrl;
  mainA.download = `magnit_report_${today}.txt`;
  mainA.click();
  URL.revokeObjectURL(mainUrl);

  console.log(
    "%c📊 Основной отчёт сохранён: magnit_report_" + today + ".txt",
    "color: #006600; font-weight: bold;",
  );

  // ───── 2. Отчёт по ошибкам (только если были) ─────
  const errorStats = stats.filter((s) => s.hasError);

  if (errorStats.length > 0) {
    const errorLines = [`Ошибки и проблемы при сборе Магнит — ${today}\n`];

    errorStats.forEach((item, i) => {
      const status = item.collected > 0 ? "Частичный успех" : "Полная неудача";
      errorLines.push(
        `${i + 1}. Магазин ${item.storeCode} / Категория ${item.categoryId}`,
      );
      errorLines.push(`   Статус: ${status}`);
      errorLines.push(`   Собрано товаров: ${item.collected}`);
      errorLines.push(`   Попыток: ${item.attempts}\n`);
    });

    const errorReport = errorLines.join("\n");
    const errorBlob = new Blob([errorReport], { type: "text/plain" });
    const errorUrl = URL.createObjectURL(errorBlob);
    const errorA = document.createElement("a");
    errorA.href = errorUrl;
    errorA.download = `magnit_errors_${today}.txt`;
    errorA.click();
    URL.revokeObjectURL(errorUrl);

    console.log(
      "%c⚠️ Отчёт по ошибкам сохранён: magnit_errors_" + today + ".txt",
      "color: #cc6600; font-weight: bold;",
    );
  } else {
    console.log(
      "%c✅ Все категории собраны без ошибок и ретраев!",
      "color: #006600; font-weight: bold;",
    );
  }

  console.log(
    "%cВСЁ ГОТОВО!",
    "color: #006600; font-weight: bold; font-size: 1.2em;",
  );
  console.log(
    `%cСобрано комбинаций: ${storeCodes.length} × ${categoryIds.length}`,
    "color: #444;",
  );
})();
