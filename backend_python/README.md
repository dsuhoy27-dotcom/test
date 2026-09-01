# Микросервис аудита сайтов на соответствие 152-ФЗ

Production-ready асинхронный сервис на базе **FastAPI**, **PostgreSQL** (SQLAlchemy 2.0 async), **Celery + Redis** и **Playwright**.

## Стек технологий
- **Язык**: Python 3.10+ с полной аннотацией типов
- **Фреймворк**: FastAPI + Uvicorn
- **База данных**: PostgreSQL 16 + SQLAlchemy 2.0 (asyncpg) + Alembic
- **Валидация**: Pydantic v2
- **Очереди**: Celery + Redis
- **Парсинг DOM**: Playwright Headless Chromium + BeautifulSoup4 (lxml)
- **Безопасность**: SlowAPI (Rate Limiting) + Nginx

## Быстрый старт через Docker Compose
```bash
docker-compose up -d --build
```

Сервис запустится и будет доступен по адресам:
- REST API: `http://localhost:8000/docs` (Swagger UI)
- Эндпоинты:
  - `POST /api/v1/audit/scan` — Запуск аудита (возвращает `task_id`)
  - `GET /api/v1/audit/status/{task_id}` — Поллинг статуса и прогресса
  - `GET /api/v1/audit/report/{task_id}` — Итоговый JSON-отчет по 152-ФЗ и КоАП РФ
