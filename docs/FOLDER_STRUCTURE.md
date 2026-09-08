# Структура папок

```text
retail-collector/
├── README.md
├── AGENTS.md
├── .gitignore
├── .env.example
├── package.json                 # появится после инициализации Node.js
├── tsconfig.json                # появится после настройки TypeScript
│
├── config/
│   ├── config.example.json
│   └── config.json              # локальный, не коммитить
│
├── docs/
│   ├── PROJECT_CONTEXT.md
│   ├── ARCHITECTURE.md
│   ├── DEVELOPMENT_PLAN.md
│   └── FOLDER_STRUCTURE.md
│
├── old-scripts/
│   ├── pyaterochka-console.js
│   ├── magnit-console.js
│   ├── json_to_excel_combined.js
│   └── README.md
│
├── samples/
│   ├── pyaterochka/
│   │   └── sample.json
│   ├── magnit/
│   │   └── sample.json
│   └── README.md
│
├── src/
│   ├── index.ts
│   ├── config/
│   ├── core/
│   ├── browser/
│   ├── collectors/
│   │   ├── pyaterochka/
│   │   └── magnit/
│   ├── normalizers/
│   │   ├── pyaterochka/
│   │   └── magnit/
│   ├── database/
│   ├── scheduler/
│   ├── exporter/
│   └── api/
│
├── tests/
│   ├── collectors/
│   ├── normalizers/
│   └── fixtures/
│
├── profiles/
│   ├── pyaterochka/
│   └── magnit/
│
├── data/
│   ├── raw/
│   └── normalized/
│
└── logs/
```

## Куда положить существующие файлы

### Старый скрипт Пятёрочки

```text
old-scripts/pyaterochka-console.js
```

### Старый скрипт Магнита

```text
old-scripts/magnit-console.js
```

### Старый Node.js-конвертер

```text
old-scripts/json_to_excel_combined.js
```

### Пример ответа Пятёрочки

```text
samples/pyaterochka/sample.json
```

### Пример ответа Магнита

```text
samples/magnit/sample.json
```

### Коды магазинов

На первом этапе можно положить временно сюда:

```text
config/stores.pyaterochka.json
config/stores.magnit.json
```

После добавления PostgreSQL они будут импортированы в таблицу `stores`.

### Коды категорий

Временно:

```text
config/categories.pyaterochka.json
config/categories.magnit.json
```

Позднее — таблица `categories`.

## Что не должно попадать в Git

- `.env`;
- `config/config.json`;
- `profiles/`;
- `data/`;
- `logs/`;
- реальные cookies;
- дампы базы;
- пароли и строки подключения.
