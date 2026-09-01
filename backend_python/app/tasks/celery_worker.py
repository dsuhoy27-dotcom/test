import asyncio
import uuid
from datetime import datetime
from sqlalchemy import select, update

from app.core.celery_app import celery_app
from app.core.database import AsyncSessionLocal
from app.models.audit import AuditTask, TaskStatus
from app.services.parser import WebsiteParserService
from app.services.compliance import ComplianceEngine


@celery_app.task(bind=True, name="app.tasks.celery_worker.run_audit_pipeline")
def run_audit_pipeline(self, task_id_str: str, target_url: str, max_pages: int = 5):
    """Синхронная обертка Celery над асинхронным пайплайном аудита."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(
            _async_audit_pipeline(task_id_str, target_url, max_pages)
        )
    finally:
        loop.close()


async def _update_progress(task_uuid: uuid.UUID, progress: int, step_desc: str):
    """Вспомогательная функция обновления прогресса задачи в PostgreSQL."""
    async with AsyncSessionLocal() as session:
        await session.execute(
            update(AuditTask)
            .where(AuditTask.id == task_uuid)
            .values(progress=progress, current_step=step_desc)
        )
        await session.commit()


async def _async_audit_pipeline(task_id_str: str, target_url: str, max_pages: int = 5):
    """Асинхронный конвейер полного аудита сайта."""
    task_uuid = uuid.UUID(task_id_str)

    async with AsyncSessionLocal() as session:
        await session.execute(
            update(AuditTask)
            .where(AuditTask.id == task_uuid)
            .values(
                status=TaskStatus.PROCESSING,
                progress=5,
                current_step="Инициализация сетевого анализатора..."
            )
        )
        await session.commit()

    try:
        # 1. Проверка SSL-сертификата и шифрования (15%)
        await _update_progress(task_uuid, 15, "Проверка SSL-сертификата и HTTPS соединения...")
        ssl_result = await WebsiteParserService.analyze_ssl(target_url)

        # 2. Проверка локализации серверов и баз данных (30%)
        await _update_progress(task_uuid, 30, "Проверка локализации сервера и GeoIP (РФ, ч. 5 ст. 18)...")
        loc_result = await WebsiteParserService.analyze_localization(target_url)

        # 3. Сканирование страниц через Playwright (70%)
        async def step_callback(msg: str):
            await _update_progress(task_uuid, 50, msg)

        await _update_progress(task_uuid, 45, "Запуск браузерного рендеринга (Playwright)...")
        scanned_pages, forms_results, policy_result, cookie_result = await WebsiteParserService.scan_pages_playwright(
            base_url=target_url,
            max_pages=max_pages,
            status_callback=step_callback
        )

        # 4. Расчет соответствия и правовой анализ (90%)
        await _update_progress(task_uuid, 90, "Анализ рисков по ст. 13.11 КоАП РФ и расчет штрафов...")
        report = ComplianceEngine.evaluate(
            target_url=target_url,
            scanned_pages=scanned_pages,
            forms_results=forms_results,
            policy_result=policy_result,
            cookie_result=cookie_result,
            ssl_result=ssl_result,
            loc_result=loc_result,
        )

        # 5. Сохранение итогового отчета в БД (100%)
        async with AsyncSessionLocal() as session:
            await session.execute(
                update(AuditTask)
                .where(AuditTask.id == task_uuid)
                .values(
                    status=TaskStatus.COMPLETED,
                    progress=100,
                    current_step="Аудит успешно завершен",
                    compliance_score=report.compliance_score,
                    risk_level=report.risk_level,
                    max_potential_fine_rub=report.max_potential_fine_rub,
                    report_data=report.model_dump(mode="json"),
                    completed_at=datetime.now()
                )
            )
            await session.commit()

        return {"status": "SUCCESS", "task_id": task_id_str, "score": report.compliance_score}

    except Exception as e:
        import traceback
        err_msg = f"{str(e)}\n{traceback.format_exc()}"
        async with AsyncSessionLocal() as session:
            await session.execute(
                update(AuditTask)
                .where(AuditTask.id == task_uuid)
                .values(
                    status=TaskStatus.FAILED,
                    progress=100,
                    current_step="Ошибка выполнения аудита",
                    error_message=err_msg,
                    completed_at=datetime.now()
                )
            )
            await session.commit()
        raise e
