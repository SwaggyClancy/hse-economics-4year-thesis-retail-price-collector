# Минимальный сборщик Пятёрочки

Сборщик обрабатывает одну пару `магазин × категория`, последовательно проходит
всю пагинацию и сохраняет каждый исходный ответ API отдельно.

## Установка

```powershell
pnpm install
pnpm exec playwright install chromium
```

## Запуск

Перед первым сбором один раз подготовьте отдельный профиль:

```powershell
pnpm profile:pyaterochka
```

В открывшемся Chrome выберите адрес и магазин обычным интерфейсом сайта, затем
закройте вкладку. Основной пользовательский профиль Chrome не используется.

Тестовые коды из курсовой используются по умолчанию:

```powershell
pnpm collect:pyaterochka
```

Другую пару можно передать явно:

```powershell
pnpm collect:pyaterochka -- --store L718 --category 251C13093
```

По умолчанию браузер видимый. Для headless-режима:

```powershell
pnpm collect:pyaterochka -- --headless
```

На Windows по умолчанию Playwright управляет установленным Chrome с отдельным
профилем проекта. Встроенный Chromium можно выбрать явно:

```powershell
pnpm collect:pyaterochka -- --browser-channel chromium
```

Профиль сохраняется в `profiles/pyaterochka/`. Не запускайте одновременно два
процесса с этим профилем.

## Результаты

Исходные страницы сохраняются в:

```text
data/raw/YYYY-MM-DD/pyaterochka/STORE_CATEGORY_TIMESTAMP/
```

`manifest.json` содержит время запуска, количество страниц и товаров. Сетевые
события и ошибки записываются в `logs/YYYY-MM-DD/pyaterochka.jsonl`. Cookies и
чувствительные заголовки в файлы и журнал не записываются.

После успешного raw-сбора нормализованные снимки автоматически сохраняются в:

```text
data/normalized/YYYY-MM-DD/pyaterochka/STORE_CATEGORY_TIMESTAMP.json
```

Денежные значения хранятся целым числом копеек (`amountMinor`) с валютой `RUB`.
Каждая запись содержит точное время получения и ссылку на исходную raw-страницу.

## Последовательный пакетный запуск

`--dry-run` проверяет план без браузера, запросов и записи состояния.
HTTP 401/403/429 и Retry-After останавливают очередь (paused). Незавершённые
задания не считаются completed. `--retry-failed` выбирает только failed,
а не все оставшиеся pending. Для них затем используйте `--resume`.

`--stores-file` теперь также принимает `stores.json` от discovery (поле
`externalCode`) или TXT с одним кодом на строку. Для JSON проверяется сеть.
Категории можно передать JSON или TXT через `--categories-file`. Коды остаются
строками; ведущие нули сохраняются. Сбор discovery автоматически не запускается.

Создайте локальные файлы на основе примеров:

```text
config/stores.pyaterochka.json
config/categories.pyaterochka.json
```

Затем запустите:

```powershell
pnpm collect:pyaterochka:batch
```

Обрабатываются только записи, у которых `active` не равен `false`. Все пары
`магазин × категория` выполняются строго последовательно с паузой между
задачами. Состояние запуска сохраняется после каждого изменения в
`data/state/pyaterochka/`.

Продолжить прерванный запуск:

```powershell
pnpm collect:pyaterochka -- --resume data/state/pyaterochka/RUN.json
```

Повторить только задачи со статусом `failed`:

```powershell
pnpm collect:pyaterochka -- --retry-failed data/state/pyaterochka/RUN.json
```
