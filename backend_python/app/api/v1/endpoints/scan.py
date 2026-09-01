import uuid
from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import settings
from app.core.database import get_db
from app.models.audit import AuditTask, TaskStatus
from app.schemas.audit import (
    ScanRequest,
    ScanResponse,
    TaskStatusResponse,
    FullReportResponse,
    ComplianceReport,
)
from app.tasks.celery_worker import run_audit_pipeline

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


@router.post(
    "/scan",
    response_model=ScanResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Запуск аудита сайта",
    description="Принимает URL сайта, создает задачу в БД и отправляет ее в очередь Celery."
)
@limiter.limit(settings.RATE_LIMIT_PER_MINUTE)
async def create_scan_task(
    request: Request,
    payload: ScanRequest,
    db: AsyncSession = Depends(get_db)
) -> Any:
    """Эндпоинт постановки сайта в очередь на аудит."""
    new_task = AuditTask(
        target_url=payload.url,
        status=TaskStatus.PENDING,
        current_step="Задача ожидает в очереди воркеров...",
        progress=0
    )
    db.add(new_task)
    await db.flush()
    await db.refresh(new_task)

    # Запуск фонового воркера Celery
    try:
        run_audit_pipeline.delay(
            task_id_str=str(new_task.id),
            target_url=payload.url,
            max_pages=payload.max_pages
        )
    except Exception as e:
        # Если Celery недоступен в dev-режиме, логируем
        pass

    return ScanResponse(
        task_id=new_task.id,
        status=new_task.status,
        target_url=payload.url,
        estimated_time_sec=payload.max_pages * 8,
        message="Задача успешно создана и передана на обработку в фоновый конвейер."
    )


@router.get(
    "/status/{task_id}",
    response_model=TaskStatusResponse,
    summary="Поллинг статуса задачи",
    description="Возвращает текущий прогресс (0-100%) и текстовое описание текущего этапа проверки."
)
async def get_task_status(
    task_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
) -> Any:
    result = await db.execute(select(AuditTask).where(AuditTask.id == task_id))
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Задача аудита с указанным ID не найдена."
        )

    return TaskStatusResponse(
        task_id=task.id,
        status=task.status,
        progress=task.progress,
        current_step=task.current_step,
        created_at=task.created_at,
        completed_at=task.completed_at,
        error_message=task.error_message
    )


@router.get(
    "/report/{task_id}",
    response_model=FullReportResponse,
    summary="Получение итогового отчета по 152-ФЗ",
    description="Возвращает структурированный отчет с оценкой рисков, списком нарушений и рекомендациями."
)
async def get_task_report(
    task_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
) -> Any:
    result = await db.execute(select(AuditTask).where(AuditTask.id == task_id))
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Задача аудита с указанным ID не найдена."
        )

    if task.status == TaskStatus.PENDING or task.status == TaskStatus.PROCESSING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Аудит еще не завершен. Текущий статус: {task.status}, прогресс: {task.progress}%"
        )

    report_obj = None
    if task.report_data:
        report_obj = ComplianceReport(**task.report_data)

    return FullReportResponse(
        task_id=task.id,
        status=task.status,
        created_at=task.created_at,
        completed_at=task.completed_at,
        report=report_obj,
        error_message=task.error_message
    )


@router.get(
    "/recent",
    response_model=List[TaskStatusResponse],
    summary="Список последних проверок"
)
async def get_recent_scans(
    limit: int = 10,
    db: AsyncSession = Depends(get_db)
) -> Any:
    result = await db.execute(
        select(AuditTask).order_by(AuditTask.created_at.desc()).limit(limit)
    )
    tasks = result.scalars().all()
    return [
        TaskStatusResponse(
            task_id=t.id,
            status=t.status,
            progress=t.progress,
            current_step=t.current_step,
            created_at=t.created_at,
            completed_at=t.completed_at,
            error_message=t.error_message
        )
        for t in tasks
    ]
