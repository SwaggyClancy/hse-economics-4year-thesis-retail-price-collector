// =============================================================================
// СКРИПТ МАССОВОГО СБОРА ТОВАРОВ ИЗ ПЯТЁРОЧКИ (несколько магазинов + несколько категорий)
// Автор: Clancy
// Для курсовой: собираем данные сразу по нескольким точкам и разделам
// =============================================================================
(async function aggregatePyaterochkaProducts() {
  console.log(
    "%c🛠️ Старт массового сбора данных из Пятёрочки",
    "color: #0066cc; font-weight: bold; font-size: 1.1em;",
  );

  // ──────────────────────────────────────────────────────────────
  // 1. ВВОД ДАННЫХ ОТ ПОЛЬЗОВАТЕЛЯ
  // ──────────────────────────────────────────────────────────────

  const storesInput = prompt(
    "Введи ID магазинов через запятую\n" + "Пример: 324K,Y639,A1B2,C7D4",
  );
  const categoriesInput = prompt(
    "Введи ID категорий через запятую\n" +
      "Пример: 251C12891,251C17045,251C13103",
  );

  if (!storesInput || !categoriesInput) {
    console.error(
      "%c❌ Не введены магазины или категории — выхожу",
      "color: #cc0000; font-weight: bold;",
    );
    return;
  }

  const stores = storesInput
    .trim()
    .toUpperCase()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const categories = categoriesInput
    .trim()
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);

  console.log(
    `%c📋 Буду собирать данные для ${stores.length} магазинов и ${categories.length} категорий`,
    "color: #006600;",
  );
  console.log(`%cМагазины: ${stores.join(", ")}`, "color: #444;");
  console.log(`%cКатегории: ${categories.join(", ")}`, "color: #444;");

  // ──────────────────────────────────────────────────────────────
  // 2. Основные настройки
  // ──────────────────────────────────────────────────────────────

  const PRODUCTS_PER_PAGE = 12;
  const MIN_DELAY_MS = 1200;
  const MAX_DELAY_MS = 3500;
  const DELAY_BETWEEN_COMBOS = 3000;
  const MAX_RETRIES = 2;
  const today = new Date().toISOString().slice(0, 10);

  let stats = []; // ← НОВАЯ структура для всех результатов

  // ──────────────────────────────────────────────────────────────
  // 3. Главная функция сбора (логика НЕ ИЗМЕНЕНА)
  // ──────────────────────────────────────────────────────────────

  async function collectFor(storeId, categoryId) {
    console.log(
      `\n%c→ Начинаю сбор: магазин ${storeId} | категория ${categoryId}`,
      "color: #0066cc; font-weight: bold;",
    );

    const baseUrl = `https://5d.5ka.ru/api/catalog/v2/stores/${storeId}/categories/${categoryId}/products?mode=delivery&include_restrict=true`;

    let allProducts = [];
    let offset = 0;
    let page = 1;
    let attempt = 0;

    while (attempt <= MAX_RETRIES) {
      try {
        while (true) {
          const url = `${baseUrl}&limit=${PRODUCTS_PER_PAGE}&offset=${offset}`;
          console.log(
            `%c  Запрос #${page} | offset ${offset} (попытка ${attempt + 1})`,
            "color: #888;",
          );

          const resp = await fetch(url, {
            credentials: "include",
            headers: { Accept: "application/json" },
          });

          if (!resp.ok) {
            if (resp.status === 503 && attempt < MAX_RETRIES) {
              throw new Error(
                `HTTP 503 - сервис недоступен (попробуем ещё раз)`,
              );
            }
            console.error(
              `%c  HTTP ${resp.status} — возможно неверный магазин/категория`,
              "color: #cc0000;",
            );
            throw new Error(`HTTP ${resp.status}`);
          }

          const data = await resp.json();

          if (!data?.products || !Array.isArray(data.products)) {
            console.error(
              "%c  Нет массива products — прерываю категорию",
              "color: #cc0000;",
            );
            break;
          }

          const count = data.products.length;
          console.log(`%c  Получено ${count} товаров`, "color: #006600;");

          allProducts.push(...data.products);

          if (count === 0 || count < PRODUCTS_PER_PAGE) {
            console.log(
              `%c  Конец категории (получено ${count} из ${PRODUCTS_PER_PAGE})`,
              "color: #006600;",
            );
            break;
          }

          offset += PRODUCTS_PER_PAGE;
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
          `%c⚠️ Ошибка [${storeId}/${categoryId}] (попытка ${attempt}/${MAX_RETRIES + 1}): ${err.message}`,
          "color: #cc6600;",
        );

        if (attempt > MAX_RETRIES) {
          console.error(
            `%c❌ Не удалось собрать после ${MAX_RETRIES + 1} попыток`,
            "color: #cc0000; font-weight: bold;",
          );
          break;
        }

        await new Promise((r) => setTimeout(r, 8000));
      }
    }

    // ───── Сохранение JSON (без изменений) ─────
    if (allProducts.length > 0) {
      const filename = `5ka_${storeId}_${categoryId}_${today}.json`;
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
    } else if (attempt > MAX_RETRIES) {
      console.warn(
        `%c⚠️ Ничего не собрано для ${storeId}/${categoryId}`,
        "color: #cc6600;",
      );
    }

    // ← НОВОЕ: сохраняем статистику для TXT-отчётов
    const attemptsUsed = attempt > MAX_RETRIES ? MAX_RETRIES + 1 : attempt + 1;
    stats.push({
      storeId,
      categoryId,
      collected: allProducts.length,
      attempts: attemptsUsed,
      hasError: attempt > 0 || allProducts.length === 0,
    });
  }

  // ──────────────────────────────────────────────────────────────
  // 4. Запускаем сбор по всем комбинациям (без изменений)
  // ──────────────────────────────────────────────────────────────

  for (const store of stores) {
    for (const cat of categories) {
      await collectFor(store, cat);

      if (stores.length * categories.length > 1) {
        console.log(
          `%c  Пауза между комбинациями ~${DELAY_BETWEEN_COMBOS / 1000} сек...`,
          "color: #777; font-style: italic;",
        );
        await new Promise((r) => setTimeout(r, DELAY_BETWEEN_COMBOS));
      }
    }
  }

  // ──────────────────────────────────────────────────────────────
  // 5. НОВЫЙ ФИНАЛЬНЫЙ ОТЧЁТ (TXT-файлы)
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
    if (!storeGroups[s.storeId]) storeGroups[s.storeId] = [];
    storeGroups[s.storeId].push(s);
  });

  let totalAll = 0;
  const reportLines = [`Отчёт по сбору данных Пятёрочка — ${today}\n`];

  Object.keys(storeGroups).forEach((storeId) => {
    const group = storeGroups[storeId];
    let storeTotal = 0;

    reportLines.push(`Магазин: ${storeId}`);

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
  mainA.download = `5ka_report_${today}.txt`;
  mainA.click();
  URL.revokeObjectURL(mainUrl);

  console.log(
    "%c📊 Основной отчёт сохранён: 5ka_report_" + today + ".txt",
    "color: #006600; font-weight: bold;",
  );

  // ───── 2. Отчёт по ошибкам (только если были) ─────
  const errorStats = stats.filter((s) => s.hasError);

  if (errorStats.length > 0) {
    const errorLines = [`Ошибки и проблемы при сборе Пятёрочка — ${today}\n`];

    errorStats.forEach((item, i) => {
      const status = item.collected > 0 ? "Частичный успех" : "Полная неудача";
      errorLines.push(
        `${i + 1}. Магазин ${item.storeId} / Категория ${item.categoryId}`,
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
    errorA.download = `5ka_errors_${today}.txt`;
    errorA.click();
    URL.revokeObjectURL(errorUrl);

    console.log(
      "%c⚠️ Отчёт по ошибкам сохранён: 5ka_errors_" + today + ".txt",
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
    `%cСобрано комбинаций: ${stores.length} × ${categories.length}`,
    "color: #444;",
  );
})();
