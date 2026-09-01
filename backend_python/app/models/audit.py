import enum
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from sqlalchemy import (
    String,
    DateTime,
    Enum,
    Integer,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class TaskStatus(str, enum.Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class RiskLevel(str, enum.Enum):
    MINIMAL = "MINIMAL"       # 100% соответствие
    LOW = "LOW"               # Незначительные замечания
    MEDIUM = "MEDIUM"         # Средний риск
    HIGH = "HIGH"             # Высокий риск штрафов
    CRITICAL = "CRITICAL"     # Критический риск (до 18 млн руб)


class AuditTask(Base):
    """Модель задачи на аудит веб-сайта по 152-ФЗ."""

    __tablename__ = "audit_tasks"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True
    )
    target_url: Mapped[str] = mapped_column(String(2048), nullable=False, index=True)
    status: Mapped[TaskStatus] = mapped_column(
        Enum(TaskStatus, name="task_status_enum"),
        default=TaskStatus.PENDING,
        nullable=False,
        index=True
    )
    current_step: Mapped[str] = mapped_column(
        String(255),
        default="Инициализация аудита...",
        nullable=False
    )
    progress: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Итоговые метрики
    compliance_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    risk_level: Mapped[Optional[RiskLevel]] = mapped_column(
        Enum(RiskLevel, name="risk_level_enum"),
        nullable=True
    )
    max_potential_fine_rub: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Детальный JSON-отчет со всеми узлами проверок
    report_data: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )
