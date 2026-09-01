from typing import List, Tuple
from app.models.audit import RiskLevel
from app.schemas.audit import (
    FormAuditResult,
    PrivacyPolicyAudit,
    CookieBannerAudit,
    SslAudit,
    LocalizationAudit,
    LegalViolation,
    ComplianceReport,
)


class ComplianceEngine:
    """Ядро правового анализа соблюдения 152-ФЗ и расчет рисков по КоАП РФ."""

    @classmethod
    def evaluate(
        cls,
        target_url: str,
        scanned_pages: List[str],
        forms_results: List[FormAuditResult],
        policy_result: PrivacyPolicyAudit,
        cookie_result: CookieBannerAudit,
        ssl_result: SslAudit,
        loc_result: LocalizationAudit,
    ) -> ComplianceReport:
        violations: List[LegalViolation] = []
        max_fine = 0
        score = 100

        # 1. Проверка локализации серверов (ч. 5 ст. 18 152-ФЗ, ст. 13.11 ч. 8, 9 КоАП РФ)
        if not loc_result.is_located_in_rf:
            score -= 40
            max_fine += 6000000  # До 6 млн руб (при повторном до 18 млн)
            violations.append(
                LegalViolation(
                    code="LOCALIZATION_FOREIGN_SERVER",
                    severity="CRITICAL",
                    koap_article="ст. 13.11 ч. 8, 9 КоАП РФ (ч. 5 ст. 18 152-ФЗ)",
                    title="Сервер и база данных находятся за пределами РФ",
                    description=(
                        f"IP-адрес {loc_result.ip_address} привязан к региону "
                        f"{loc_result.country_name or 'Зарубежный хостинг'}. Закон обязывает осуществлять "
                        "первичный сбор, запись и хранение ПДн граждан РФ на серверах в РФ."
                    ),
                    location=f"IP: {loc_result.ip_address}, Страна: {loc_result.country_code}",
                    fine_range_rub="от 1 000 000 ₽ до 6 000 000 ₽ (повторно до 18 000 000 ₽)",
                    remediation_guide=(
                        "Перенесите сервер или веб-приложение на российский хостинг/облачный провайдер "
                        "(Yandex Cloud, Selectel, VK Cloud и др.) с документальным подтверждением размещения ЦОД в РФ."
                    )
                )
            )

        # 2. Проверка веб-форм и чекбоксов согласия (ст. 9 152-ФЗ, ст. 13.11 ч. 1, 2 КоАП РФ)
        for form in forms_results:
            pd_fields = [f.name or f.placeholder or f.field_type for f in form.personal_data_fields]
            pd_str = ", ".join(pd_fields) if pd_fields else "поля ввода"

            if not form.checkbox_analysis.exists:
                score -= 15
                max_fine += 150000
                violations.append(
                    LegalViolation(
                        code="FORM_NO_CONSENT_CHECKBOX",
                        severity="HIGH",
                        koap_article="ст. 13.11 ч. 1, 2 КоАП РФ (ст. 9 152-ФЗ)",
                        title="Отсутствует чекбокс согласия на обработку ПДн",
                        description=(
                            f"В форме ({form.form_selector}) обнаружен сбор персональных данных ({pd_str}), "
                            "но отсутствует интерактивный элемент согласия с текстом и ссылкой на Политику."
                        ),
                        location=f"{form.page_url} -> {form.form_selector}",
                        fine_range_rub="от 60 000 ₽ до 150 000 ₽ (повторно до 500 000 ₽)",
                        remediation_guide=(
                            "Добавьте обязательный ненажатый чекбокс: «Я даю согласие на обработку персональных данных "
                            "в соответствии с Политикой конфиденциальности» с активной гиперссылкой на документ."
                        )
                    )
                )
            elif form.checkbox_analysis.is_prechecked:
                score -= 10
                max_fine += 100000
                violations.append(
                    LegalViolation(
                        code="FORM_PRECHECKED_CHECKBOX",
                        severity="MEDIUM",
                        koap_article="ст. 13.11 ч. 1 КоАП РФ (ст. 9 152-ФЗ)",
                        title="Предустановленная галочка в чекбоксе (Pre-checked)",
                        description=(
                            f"Чекбокс в форме {form.form_selector} активен по умолчанию. Позиция Роскомнадзора: "
                            "согласие должно быть осознанным и выражаться активным действием пользователя."
                        ),
                        location=f"{form.page_url} -> {form.form_selector}",
                        fine_range_rub="от 30 000 ₽ до 100 000 ₽",
                        remediation_guide="Уберите атрибут checked/defaultChecked у input. Пользователь должен нажать его сам."
                    )
                )
            elif not form.checkbox_analysis.has_consent_keywords:
                score -= 8
                max_fine += 80000
                violations.append(
                    LegalViolation(
                        code="FORM_AMBIGUOUS_CONSENT_TEXT",
                        severity="MEDIUM",
                        koap_article="ст. 13.11 ч. 1 КоАП РФ (ст. 9 152-ФЗ)",
                        title="Некорректная формулировка текста согласия",
                        description="Текст рядом с чекбоксом не содержит явных юридических формулировок согласия на обработку ПДн.",
                        location=f"{form.page_url} -> {form.form_selector}",
                        fine_range_rub="от 30 000 ₽ до 100 000 ₽",
                        remediation_guide="Укажите четкий текст: «Нажимая кнопку, даю согласие на обработку персональных данных...»"
                    )
                )

        # 3. Политика конфиденциальности (ст. 18.1 152-ФЗ, ст. 13.11 ч. 3 КоАП РФ)
        if not policy_result.found:
            score -= 25
            max_fine += 60000
            violations.append(
                LegalViolation(
                    code="POLICY_NOT_FOUND",
                    severity="HIGH",
                    koap_article="ст. 13.11 ч. 3 КоАП РФ (ст. 18.1 152-ФЗ)",
                    title="Не опубликована Политика конфиденциальности",
                    description=(
                        "Оператор обязан обеспечить неограниченный доступ к документу, определяющему "
                        "его политику в отношении обработки персональных данных."
                    ),
                    location="Все страницы (Футер / Header)",
                    fine_range_rub="от 30 000 ₽ до 60 000 ₽",
                    remediation_guide=(
                        "Разработайте и разместите в подвале (footer) всех страниц прямую ссылку на "
                        "Политику обработки персональных данных."
                    )
                )
            )
        elif not policy_result.is_accessible_200:
            score -= 15
            max_fine += 60000
            violations.append(
                LegalViolation(
                    code="POLICY_LINK_BROKEN",
                    severity="HIGH",
                    koap_article="ст. 13.11 ч. 3 КоАП РФ (ст. 18.1 152-ФЗ)",
                    title="Ссылка на Политику конфиденциальности недоступна (404/500)",
                    description="Ссылка на документ обнаружена, но возвращает ошибку при переходе.",
                    location=f"Ссылки: {', '.join(policy_result.policy_urls[:2])}",
                    fine_range_rub="от 30 000 ₽ до 60 000 ₽",
                    remediation_guide="Проверьте доступность URL документа и убедитесь в открытом доступе без авторизации."
                )
            )

        # 4. Cookie уведомление (ст. 6, 9 152-ФЗ)
        if not cookie_result.detected:
            score -= 10
            max_fine += 50000
            violations.append(
                LegalViolation(
                    code="COOKIE_BANNER_MISSING",
                    severity="MEDIUM",
                    koap_article="ст. 13.11 ч. 1 КоАП РФ (ст. 6, 9 152-ФЗ)",
                    title="Отсутствует плашка предупреждения о сборе файлов Cookie",
                    description=(
                        "На сайте используются счетчики аналитики (Метрика/GA), обрабатывающие IP и метаданные, "
                        "однако посетитель не уведомлен о сборе куки-файлов."
                    ),
                    location="Главная страница / Все страницы",
                    fine_range_rub="до 50 000 ₽ (в составе общих нарушений сбора)",
                    remediation_guide=(
                        "Установите фиксированную плашку/модальное окно с текстом: «Мы используем cookie для персонализации...» "
                        "и кнопкой принятия («Принять/OK»)."
                    )
                )
            )

        # 5. SSL / Защита соединения (ст. 19 152-ФЗ)
        if not ssl_result.is_https or not ssl_result.is_valid:
            score -= 20
            max_fine += 100000
            violations.append(
                LegalViolation(
                    code="SSL_INSECURE_CONNECTION",
                    severity="HIGH",
                    koap_article="ст. 19 152-ФЗ (Непринятие мер по защите ПДн)",
                    title="Отсутствует или недействителен SSL-сертификат (HTTP вместо HTTPS)",
                    description="Персональные данные передаются в открытом виде по незащищенному протоколу, что создает угрозу утечки.",
                    location=target_url,
                    fine_range_rub="Предписание регулятора + штраф до 100 000 ₽",
                    remediation_guide="Установите действующий TLS/SSL-сертификат и настройте постоянный 301-редирект с HTTP на HTTPS."
                )
            )

        score = max(0, min(100, score))

        # Определение уровня риска
        if not loc_result.is_located_in_rf or score < 40:
            risk_level = RiskLevel.CRITICAL
        elif score < 65 or len(violations) >= 3:
            risk_level = RiskLevel.HIGH
        elif score < 85 or len(violations) >= 1:
            risk_level = RiskLevel.MEDIUM
        elif score < 100:
            risk_level = RiskLevel.LOW
        else:
            risk_level = RiskLevel.MINIMAL

        summary_text = cls._generate_summary_text(risk_level, score, len(violations), max_fine)
        quick_fix = [v.remediation_guide for v in violations]

        return ComplianceReport(
            target_url=target_url,
            audit_date=datetime.now(),
            compliance_score=score,
            risk_level=risk_level,
            max_potential_fine_rub=max_fine,
            scanned_pages_count=len(scanned_pages),
            scanned_pages=scanned_pages,
            forms_audit=forms_results,
            privacy_policy_audit=policy_result,
            cookie_audit=cookie_result,
            ssl_audit=ssl_result,
            localization_audit=loc_result,
            violations=violations,
            summary_text=summary_text,
            quick_fix_checklist=quick_fix,
        )

    @classmethod
    def _generate_summary_text(
        cls,
        risk_level: RiskLevel,
        score: int,
        violations_count: int,
        max_fine: int,
    ) -> str:
        fine_formatted = f"{max_fine:,}".replace(",", " ")
        if risk_level == RiskLevel.MINIMAL:
            return (
                "100% соответствие требованиям 152-ФЗ. Сайт соблюдает правила сбора ПДн, "
                "сервер локализован в РФ, формы содержат корректные согласия."
            )
        elif risk_level == RiskLevel.LOW:
            return (
                f"Высокий уровень соответствия ({score}/100). Выявлены незначительные замечания "
                f"({violations_count} шт.), риск штрафов минимален."
            )
        elif risk_level == RiskLevel.MEDIUM:
            return (
                f"Средний риск штрафов ({score}/100). Обнаружено {violations_count} нарушений. "
                f"Потенциальная сумма штрафов Роскомнадзора: до {fine_formatted} ₽."
            )
        elif risk_level == RiskLevel.HIGH:
            return (
                f"Высокий риск штрафов ({score}/100). Обнаружено {violations_count} серьезных нарушений. "
                f"Рекомендуется срочное устранение замечаний. Сумма рисков: до {fine_formatted} ₽."
            )
        else:
            return (
                f"КРИТИЧЕСКИЙ РИСК ({score}/100). Выявлены фундаментальные нарушения 152-ФЗ "
                f"(включая локализацию баз данных). Штраф по КоАП РФ может составить до {fine_formatted} ₽ "
                "с риском блокировки ресурса в РФ."
            )


from datetime import datetime
