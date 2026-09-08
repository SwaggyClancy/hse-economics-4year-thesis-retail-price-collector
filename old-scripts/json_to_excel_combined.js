// json_to_excel_combined.js
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const XLSX = require("xlsx");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

function cleanPath(input) {
  return input
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\\/g, "/");
}

// Подробный парсинг имени файла
function parseFilename(filename) {
  const baseName = path.basename(filename, ".json");
  console.log(`   📄 Разбираем: ${baseName}`);

  const parts = baseName.split("_");
  console.log(`      Части: [${parts.join(" | ")}]`);

  let storeCode = "UNKNOWN";
  let categoryId = "UNKNOWN";

  if (parts.length >= 3) {
    storeCode = parts[1] || "UNKNOWN";
    categoryId = parts[2] || "UNKNOWN";
    console.log(`      → store_code = ${storeCode}`);
    console.log(`      → category_id = ${categoryId}`);
  } else {
    console.log(`      ⚠️  Мало частей (${parts.length}), ставим UNKNOWN`);
  }

  const result = {
    storeCode: storeCode.toUpperCase(),
    categoryId: categoryId.toUpperCase(),
  };
  console.log(
    `      Итог парсинга: store=${result.storeCode}, category=${result.categoryId}\n`,
  );
  return result;
}

// Форматирование цены
function formatPrice(price, is5ka) {
  if (price === null || price === undefined || price === "") return "";

  let num = parseFloat(price);
  if (isNaN(num)) return String(price);

  if (is5ka) {
    return num.toFixed(2).replace(".", ",");
  } else {
    num = num / 100;
    return num.toFixed(2).replace(".", ",");
  }
}

console.log(
  "📊 Финальный конвертер JSON → Excel + подробные логи + TXT отчёт\n",
);

(async () => {
  try {
    const folder5ka = cleanPath(
      await ask("Путь к папке с JSON-файлами Пятёрочки:\n"),
    );
    const folderMagnit = cleanPath(
      await ask("Путь к папке с JSON-файлами Магнита:\n"),
    );

    let outputFolder = cleanPath(
      await ask("\nКуда сохранять файлы?\n(Enter — текущая папка): "),
    );
    if (!outputFolder) outputFolder = process.cwd();

    if (!fs.existsSync(outputFolder)) {
      fs.mkdirSync(outputFolder, { recursive: true });
      console.log(`📁 Создана папка: ${outputFolder}`);
    }

    const manualDate = await ask(
      "\nВведи дату для всех записей (YYYY-MM-DD):\n",
    );
    if (!/^\d{4}-\d{2}-\d{2}$/.test(manualDate)) {
      console.error("❌ Неверный формат даты!");
      rl.close();
      return;
    }

    console.log(`\n🚀 Запуск обработки... Дата: ${manualDate}\n`);

    let allRows = [];
    let products5ka = [];
    let productsMagnit = [];

    const stats5ka = {
      totalFiles: 0,
      totalItems: 0,
      byStore: {},
      byCategory: {},
    };
    const statsMagnit = {
      totalFiles: 0,
      totalItems: 0,
      byStore: {},
      byCategory: {},
    };

    // ====================== ПЯТЁРОЧКА ======================
    console.log("📦 === ОБРАБОТКА ПЯТЁРОЧКИ ===");
    const files5ka = fs
      .readdirSync(folder5ka)
      .filter((f) => f.endsWith(".json"));
    stats5ka.totalFiles = files5ka.length;
    console.log(`   Найдено файлов: ${files5ka.length}`);

    for (const file of files5ka) {
      const { storeCode, categoryId } = parseFilename(file);

      if (!stats5ka.byStore[storeCode]) stats5ka.byStore[storeCode] = 0;
      if (!stats5ka.byCategory[categoryId]) stats5ka.byCategory[categoryId] = 0;

      try {
        const data = JSON.parse(
          fs.readFileSync(path.join(folder5ka, file), "utf8"),
        );
        const items = Array.isArray(data) ? data : [];

        console.log(`      → В файле ${items.length} товаров`);

        for (const item of items) {
          if (!item.plu) continue;

          const row = {
            store_chain: "Pyaterochka",
            store_code: storeCode,
            category_id: categoryId,
            date: manualDate,
            product_id: String(item.plu),
            name: item.name || "",
            price_regular: formatPrice(item.prices?.regular, true),
            price_discount: formatPrice(item.prices?.discount, true),
            uom: item.uom || "",
            property_clarification: item.property_clarification || "",
            is_available: item.is_available ? "Да" : "Нет",
            rating: item.rating?.rating_average || "",
          };

          products5ka.push(row);
          allRows.push(row);

          stats5ka.byStore[storeCode]++;
          stats5ka.byCategory[categoryId]++;
          stats5ka.totalItems++;
        }
      } catch (e) {
        console.log(`   ⚠️  Ошибка чтения ${file}`);
      }
    }
    console.log(
      `✅ Пятёрочка завершена. Всего записей: ${products5ka.length}\n`,
    );

    // ====================== МАГНИТ ======================
    console.log("📦 === ОБРАБОТКА МАГНИТА ===");
    const filesMagnit = fs
      .readdirSync(folderMagnit)
      .filter((f) => f.endsWith(".json"));
    statsMagnit.totalFiles = filesMagnit.length;
    console.log(`   Найдено файлов: ${filesMagnit.length}`);

    for (const file of filesMagnit) {
      const { storeCode, categoryId } = parseFilename(file);

      if (!statsMagnit.byStore[storeCode]) statsMagnit.byStore[storeCode] = 0;
      if (!statsMagnit.byCategory[categoryId])
        statsMagnit.byCategory[categoryId] = 0;

      try {
        const data = JSON.parse(
          fs.readFileSync(path.join(folderMagnit, file), "utf8"),
        );
        const items = Array.isArray(data) ? data : [];

        console.log(`      → В файле ${items.length} товаров`);

        for (const item of items) {
          if (!item.id) continue;

          const row = {
            store_chain: "Magnit",
            store_code: storeCode,
            category_id: categoryId,
            date: manualDate,
            product_id: String(item.id),
            name: item.name || "",
            price_regular: formatPrice(item.price, false),
            price_discount: formatPrice(item.promotion?.oldPrice, false),
            uom: item.weighted?.unitLabel || "шт",
            property_clarification: "",
            is_available: item.quantity && item.quantity > 0 ? "Да" : "Нет",
            rating: item.ratings?.rating || "",
          };

          productsMagnit.push(row);
          allRows.push(row);

          statsMagnit.byStore[storeCode]++;
          statsMagnit.byCategory[categoryId]++;
          statsMagnit.totalItems++;
        }
      } catch (e) {
        console.log(`   ⚠️  Ошибка чтения ${file}`);
      }
    }
    console.log(
      `✅ Магнит завершён. Всего записей: ${productsMagnit.length}\n`,
    );

    // ====================== УНИКАЛЬНЫЕ ======================
    const unique5ka = [
      ...new Map(products5ka.map((i) => [i.product_id, i])).values(),
    ];
    const uniqueMagnit = [
      ...new Map(productsMagnit.map((i) => [i.product_id, i])).values(),
    ];

    console.log(
      `📊 Уникальных товаров:\n   Пятёрочка → ${unique5ka.length}\n   Магнит → ${uniqueMagnit.length}\n`,
    );

    // ====================== СОХРАНЕНИЕ EXCEL ======================
    const today = new Date().toISOString().slice(0, 10);

    const wb5ka = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb5ka,
      XLSX.utils.json_to_sheet(products5ka),
      "All",
    );
    XLSX.utils.book_append_sheet(
      wb5ka,
      XLSX.utils.json_to_sheet(unique5ka),
      "Unique",
    );
    XLSX.writeFile(wb5ka, path.join(outputFolder, `5ka_full_${today}.xlsx`));

    const wbMagnit = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wbMagnit,
      XLSX.utils.json_to_sheet(productsMagnit),
      "All",
    );
    XLSX.utils.book_append_sheet(
      wbMagnit,
      XLSX.utils.json_to_sheet(uniqueMagnit),
      "Unique",
    );
    XLSX.writeFile(
      wbMagnit,
      path.join(outputFolder, `magnit_full_${today}.xlsx`),
    );

    const wbCombined = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wbCombined,
      XLSX.utils.json_to_sheet(allRows),
      "Combined",
    );
    XLSX.writeFile(
      wbCombined,
      path.join(outputFolder, `combined_full_${today}.xlsx`),
    );

    // ====================== TXT ОТЧЁТ ======================
    let report = `ОТЧЁТ ПО СБОРАМ — ${manualDate}\n`;
    report += "=".repeat(70) + "\n\n";

    report += `ПЯТЁРОЧКА\n`;
    report += `Файлов обработано: ${stats5ka.totalFiles}\n`;
    report += `Всего записей: ${stats5ka.totalItems}\n`;
    report += `Уникальных товаров: ${unique5ka.length}\n\n`;
    report += "По магазинам:\n";
    Object.keys(stats5ka.byStore)
      .sort()
      .forEach((s) => {
        report += `   ${s.padEnd(12)} : ${stats5ka.byStore[s]} товаров\n`;
      });
    report += "\nПо категориям:\n";
    Object.keys(stats5ka.byCategory)
      .sort()
      .forEach((c) => {
        report += `   ${c.padEnd(15)} : ${stats5ka.byCategory[c]} товаров\n`;
      });

    report += "\n" + "=".repeat(50) + "\n\n";

    report += `МАГНИТ\n`;
    report += `Файлов обработано: ${statsMagnit.totalFiles}\n`;
    report += `Всего записей: ${statsMagnit.totalItems}\n`;
    report += `Уникальных товаров: ${uniqueMagnit.length}\n\n`;
    report += "По магазинам:\n";
    Object.keys(statsMagnit.byStore)
      .sort()
      .forEach((s) => {
        report += `   ${s.padEnd(12)} : ${statsMagnit.byStore[s]} товаров\n`;
      });
    report += "\nПо категориям:\n";
    Object.keys(statsMagnit.byCategory)
      .sort()
      .forEach((c) => {
        report += `   ${c.padEnd(15)} : ${statsMagnit.byCategory[c]} товаров\n`;
      });

    fs.writeFileSync(path.join(outputFolder, `report_${today}.txt`), report);

    console.log("\n" + "=".repeat(80));
    console.log("✅ ВСЁ УСПЕШНО ЗАВЕРШЕНО!");
    console.log("=".repeat(80));
    console.log(`📁 Папка сохранения: ${outputFolder}`);
    console.log(`📄 5ka_full_${today}.xlsx`);
    console.log(`📄 magnit_full_${today}.xlsx`);
    console.log(`📄 combined_full_${today}.xlsx`);
    console.log(`📝 report_${today}.txt  ← подробный отчёт`);
  } catch (err) {
    console.error("\n❌ Ошибка:", err.message);
  } finally {
    rl.close();
  }
})();
