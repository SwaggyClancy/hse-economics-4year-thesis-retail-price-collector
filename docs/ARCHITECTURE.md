# Архитектура

## Общая схема

```text
Scheduler
   ↓
Task Queue
   ├── Pyaterochka Workers
   └── Magnit Workers
            ↓
        Collectors
            ↓
        Raw Storage
            ↓
        Normalizers
            ↓
        PostgreSQL
            ↓
        Reports / API / Export
```

## Модули

### `src/store-discovery/`

Отдельная подсистема первичной и периодической инициализации справочника
магазинов:

- получает коды, адреса и координаты независимо для каждой сети;
- сохраняет неизменённые raw-ответы и checkpoint;
- устраняет повторы кодов;
- определяет административные и муниципальные районы;
- экспортирует JSON, CSV и текстовый список кодов;
- не запускает сбор товаров напрямую.

Обновление справочника создаёт новый снимок. Пропавшие коды сохраняются в
истории со статусом `not_observed`, а не удаляются автоматически.

### `src/collectors/`

Содержит код, зависящий от конкретной сети.

```text
collectors/
├── pyaterochka/
└── magnit/
```

Задача collector-модуля:

- открыть браузерную сессию;
- выполнить запросы;
- пройти пагинацию;
- вернуть исходные данные;
- не решать вопросы SQL и Excel.

### `src/core/`

Общие типы и логика:

- единая модель товара;
- идентификаторы задач;
- типы ошибок;
- retry/backoff;
- логирование;
- конфигурация.

### `src/database/`

Работа с PostgreSQL:

- миграции;
- репозитории;
- транзакции;
- сохранение запусков, задач и снимков цен.

### `src/scheduler/`

Создание дневных запусков и очередей:

```text
магазины × категории = задания
```

Статусы:

- `pending`;
- `running`;
- `success`;
- `retry`;
- `failed`.

### `src/exporter/`

Позднее:

- Excel;
- CSV;
- отчёты;
- агрегаты.

### `src/api/`

Локальный HTTP API для управления:

```text
GET  /status
GET  /runs
GET  /runs/:id
GET  /errors
POST /runs/start
POST /runs/:id/retry
POST /collector/stop
POST /store-discovery/start
POST /store-discovery/:id/resume
GET  /store-discovery/:id
GET  /stores
GET  /stores/changes
POST /stores/changes/apply
```

## Браузерные профили

```text
profiles/
├── pyaterochka/
└── magnit/
```

Каждая сеть использует собственный профиль.

Профили не должны попадать в Git.

## Предлагаемые таблицы

### `stores`

- id;
- chain;
- external_code;
- name;
- city;
- address;
- latitude;
- longitude;
- active.

### `categories`

- id;
- chain;
- external_code;
- name;
- active.

### `collection_runs`

Один полный логический запуск.

- id;
- started_at;
- finished_at;
- status;
- trigger_type.

### `collection_tasks`

Одна пара магазин × категория.

- id;
- run_id;
- store_id;
- category_id;
- status;
- attempt_count;
- started_at;
- finished_at;
- error_message.

### `products`

Справочник товаров.

- id;
- chain;
- external_product_id;
- canonical_name;
- first_seen_at;
- last_seen_at.

### `product_snapshots`

Состояние товара в магазине в конкретный момент.

- id;
- run_id;
- task_id;
- store_id;
- category_id;
- product_id;
- collected_at;
- regular_price;
- discount_price;
- available;
- unit;
- rating;
- raw_reference.

### `collection_errors`

- id;
- run_id;
- task_id;
- chain;
- error_type;
- message;
- created_at;
- details.

## Исходные файлы

Рекомендуемая схема:

```text
data/raw/
└── YYYY-MM-DD/
    ├── pyaterochka/
    │   └── STORE_CATEGORY_TIMESTAMP.json
    └── magnit/
        └── STORE_CATEGORY_TIMESTAMP.json
```

Сначала исходный ответ сохраняется на диск, затем нормализуется и записывается в БД.
