import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator
from app.models.audit import TaskStatus, RiskLevel


# --- Входные схемы ---

class ScanRequest(BaseModel):
    """Схема запроса на запуск аудита сайта."""
    url: str = Field(
        ...,
        description="URL целевого сайта для проверки",
        examples=["https://example.ru"]
    )
    deep_scan: bool = Field(
        default=True,
        description="Сканировать вложенные страницы (до 5 страниц)"
    )
    max_pages: int = Field(
        default=5,
        ge=1,
        le=15,
        description="Максимальное количество сканируемых страниц"
    )

    @field_validator("url")
    @classmethod
    def validate_and_normalize_url(cls, v: str) -> str:
        url_str = v.strip()
        if not url_str.startswith(("http://", "https://")):
            url_str = f"https://{url_str}"
        return url_str


# --- Промежуточные схемы проверок ---

class FormField(BaseModel):
    field_type: str = Field(..., description="Тип поля: text, email, tel, etc.")
    name: Optional[str] = None
    placeholder: Optional[str] = None
    label: Optional[str] = None
    is_personal_data: bool = Field(
        ...,
        description="Является ли поле сбором ПДн (ФИО, телефон, почта и т.д.)"
    )
    pd_category: Optional[str] = None


class CheckboxAnalysis(BaseModel):
    exists: bool = Field(..., description="Наличие чекбокса согласия в форме")
    is_required: bool = False
    is_prechecked: bool = Field(
        default=False,
        description="Предустановлена ли галочка (нарушение добровольности согласия)"
    )
    associated_text: Optional[str] = None
    has_consent_keywords: bool = False
    has_policy_link: bool = False
    policy_link_url: Optional[str] = None


class FormAuditResult(BaseModel):
    page_url: str
    form_id: Optional[str] = None
    form_action: Optional[str] = None
    form_selector: str
    fields_count: int
    personal_data_fields: List[FormField] = []
    checkbox_analysis: CheckboxAnalysis
    is_compliant: bool
    violations: List[str] = []


class PrivacyPolicyAudit(BaseModel):
    found: bool
    policy_urls: List[str] = []
    anchor_texts: List[str] = []
    is_accessible_200: bool = False
    has_company_requisites: bool = False
    is_direct_footer_link: bool = False
    violations: List[str] = []


class CookieBannerAudit(BaseModel):
    detected: bool
    banner_type: Optional[str] = None  # fixed_bottom, modal, notification
    has_accept_button: bool = False
    has_policy_mention: bool = False
    raw_banner_text: Optional[str] = None
    third_party_trackers: List[str] = []  # Yandex.Metrika, GA, VK Pixel
    is_compliant: bool = False
    violations: List[str] = []


class SslAudit(BaseModel):
    is_https: bool
    is_valid: bool
    issuer: Optional[str] = None
    valid_to: Optional[str] = None
    days_left: Optional[int] = None
    protocols: List[str] = []
    violations: List[str] = []


class LocalizationAudit(BaseModel):
    ip_address: Optional[str] = None
    hostname: Optional[str] = None
    country_code: Optional[str] = None
    country_name: Optional[str] = None
    city: Optional[str] = None
    isp: Optional[str] = None
    is_located_in_rf: bool
    violations: List[str] = []


class LegalViolation(BaseModel):
    code: str
    severity: str  # CRITICAL, HIGH, MEDIUM, LOW
    koap_article: str
    title: str
    description: str
    location: Optional[str] = None
    fine_range_rub: str
    remediation_guide: str


# --- Итоговые схемы API ---

class ScanResponse(BaseModel):
    task_id: uuid.UUID
    status: TaskStatus
    target_url: str
    estimated_time_sec: int
    message: str


class TaskStatusResponse(BaseModel):
    task_id: uuid.UUID
    status: TaskStatus
    progress: int
    current_step: str
    created_at: datetime
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None


class ComplianceReport(BaseModel):
    target_url: str
    audit_date: datetime
    compliance_score: int  # 0 to 100
    risk_level: RiskLevel
    max_potential_fine_rub: int
    scanned_pages_count: int
    scanned_pages: List[str] = []

    # 6 основных блоков аудита
    forms_audit: List[FormAuditResult] = []
    privacy_policy_audit: PrivacyPolicyAudit
    cookie_audit: CookieBannerAudit
    ssl_audit: SslAudit
    localization_audit: LocalizationAudit

    # Сводка нарушений и штрафов
    violations: List[LegalViolation] = []
    summary_text: str
    quick_fix_checklist: List[str] = []


class FullReportResponse(BaseModel):
    task_id: uuid.UUID
    status: TaskStatus
    created_at: datetime
    completed_at: Optional[datetime] = None
    report: Optional[ComplianceReport] = None
    error_message: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
