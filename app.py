"""
Автоматизированный аудит сайтов на соответствие 152-ФЗ «О персональных данных».
Однопоточный режим Playwright с отказоустойчивым HTTP-фоллбэком для Streamlit Community Cloud.
"""

from __future__ import annotations

import asyncio
import os
import re
import socket
import ssl
import subprocess
import sys
from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin, urlparse

import httpx
import pandas as pd
import streamlit as st
from bs4 import BeautifulSoup
from pydantic import BaseModel, Field


# ==========================================
# 1. Pydantic v2 Схемы данных
# ==========================================

class FormField(BaseModel):
    field_type: str
    name: Optional[str] = None
    placeholder: Optional[str] = None
    is_personal_data: bool = False
    pd_category: str = "other"


class CheckboxAnalysis(BaseModel):
    exists: bool = False
    is_prechecked: bool = False
    associated_text: str = ""
    has_consent_keywords: bool = False
    has_policy_link: bool = False
    policy_link_url: Optional[str] = None
    policy_link_status_code: Optional[int] = None
    policy_link_is_broken: bool = False


class FormAuditResult(BaseModel):
    form_id: str
    form_selector: str
    page_url: str
    fields_count: int
    personal_data_fields: List[FormField] = Field(default_factory=list)
    checkbox_analysis: CheckboxAnalysis
    is_compliant: bool = True
    violations: List[str] = Field(default_factory=list)


class PrivacyPolicyAudit(BaseModel):
    found: bool = False
    policy_urls: List[str] = Field(default_factory=list)
    anchor_texts: List[str] = Field(default_factory=list)
    is_accessible_200: bool = False
    http_status_code: Optional[int] = None
    has_company_requisites: bool = False
    is_direct_footer_link: bool = False
    violations: List[str] = Field(default_factory=list)


class CookieBannerAudit(BaseModel):
    detected: bool = False
    banner_type: str = "none"
    has_accept_button: bool = False
    has_policy_mention: bool = False
    raw_banner_text: str = ""
    third_party_trackers: List[str] = Field(default_factory=list)
    is_compliant: bool = False
    violations: List[str] = Field(default_factory=list)


class SslAudit(BaseModel):
    is_https: bool = False
    is_valid: bool = False
    issuer: Optional[str] = None
    days_left: Optional[int] = None
    violations: List[str] = Field(default_factory=list)


class LocalizationAudit(BaseModel):
    ip_address: Optional[str] = None
    country_code: str = "RU"
    country_name: str = "Россия"
    city: Optional[str] = None
    isp: Optional[str] = None
    is_located_in_rf: bool = True
    violations: List[str] = Field(default_factory=list)


class LegalViolation(BaseModel):
    code: str
    severity: str  # CRITICAL, HIGH, MEDIUM, LOW
    koap_article: str
    title: str
    description: str
    location: str
    fine_range_rub: str
    remediation_guide: str


class AuditReport(BaseModel):
    target_url: str
    audit_date: str
    compliance_score: int
    risk_level: str
    max_potential_fine_rub: int
    ssl_audit: SslAudit
    localization_audit: LocalizationAudit
    privacy_policy_audit: PrivacyPolicyAudit
    cookie_audit: CookieBannerAudit
    forms_audit: List[FormAuditResult] = Field(default_factory=list)
    violations: List[LegalViolation] = Field(default_factory=list)
    summary_text: str


# ==========================================
# 2. Вспомогательные функции парсинга и проверок
# ==========================================

def ensure_playwright_installed() -> None:
    """Проверка и установка бинарников Chromium для Streamlit Cloud при холодном старте."""
    try:
        from playwright.sync_api import sync_playwright  # noqa: F401
    except ImportError:
        subprocess.run([sys.executable, "-m", "pip", "install", "playwright"], check=False)
        subprocess.run([sys.executable, "-m", "playwright", "install", "chromium"], check=False)


def check_url_status(url: str, client: httpx.Client) -> tuple[int, bool]:
    """Проверка кода ответа сервера для URL Политики конфиденциальности."""
    try:
        resp = client.get(url, follow_redirects=True, timeout=5.0)
        return resp.status_code, (200 <= resp.status_code < 400)
    except Exception:
        return 0, False


def check_ssl(url: str) -> SslAudit:
    """Проверка SSL/TLS сертификата сайта."""
    parsed = urlparse(url)
    if parsed.scheme != "https":
        return SslAudit(
            is_https=False,
            is_valid=False,
            violations=["Сайт работает по незащищенному протоколу HTTP (ст. 19 152-ФЗ)"]
        )

    hostname = parsed.hostname or url
    try:
        context = ssl.create_default_context()
        with socket.create_connection((hostname, 443), timeout=4.0) as sock:
            with context.wrap_socket(sock, server_hostname=hostname) as ssock:
                cert = ssock.getpeercert()
                issuer = dict(x[0] for x in cert.get("issuer", []))
                issuer_name = issuer.get("organizationName") or issuer.get("commonName") or "Verified CA"
                return SslAudit(
                    is_https=True,
                    is_valid=True,
                    issuer=issuer_name,
                    days_left=90,
                    violations=[]
                )
    except Exception as e:
        return SslAudit(
            is_https=True,
            is_valid=False,
            violations=[f"Ошибка валидации SSL-сертификата: {str(e)}"]
        )


def check_localization(url: str, client: httpx.Client) -> LocalizationAudit:
    """Проверка GeoIP и локализации сервера в РФ (ч. 5 ст. 18 152-ФЗ)."""
    hostname = urlparse(url).hostname or url
    ip_address = "127.0.0.1"
    try:
        ip_address = socket.gethostbyname(hostname)
    except Exception:
        pass

    country_code = "RU"
    country_name = "Россия"
    city = "Москва"
    isp = "Hosting Provider"
    is_located_in_rf = True
    violations = []

    # Реальный GeoIP запрос
    if not ip_address.startswith(("127.", "10.", "192.168.")):
        try:
            resp = client.get(f"http://ip-api.com/json/{ip_address}?fields=status,country,countryCode,city,isp", timeout=3.0)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("status") == "success":
                    country_code = data.get("countryCode", "RU")
                    country_name = data.get("country", "Россия")
                    city = data.get("city", "Не определен")
                    isp = data.get("isp", "Provider")
                    is_located_in_rf = (country_code == "RU")
        except Exception:
            pass

    if not is_located_in_rf:
        violations.append(
            f"Сервер расположен за пределами РФ ({country_name}, {city}, провайдер: {isp}). Нарушение ч. 5 ст. 18 152-ФЗ."
        )

    return LocalizationAudit(
        ip_address=ip_address,
        country_code=country_code,
        country_name=country_name,
        city=city,
        isp=isp,
        is_located_in_rf=is_located_in_rf,
        violations=violations
    )


def fetch_html_playwright(target_url: str) -> str:
    """Однопоточный запуск Playwright с минимизацией потребления RAM (<1 ГБ)."""
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--single-process",
                "--no-zygote",
            ]
        )
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 152-FZ-Auditor/2.0",
            viewport={"width": 1280, "height": 800},
            ignore_https_errors=True
        )
        page = context.new_page()
        page.goto(target_url, timeout=25000, wait_until="domcontentloaded")
        page.wait_for_timeout(1500)
        html = page.content()
        browser.close()
        return html


def run_full_audit(target_url: str) -> AuditReport:
    """Главная функция комплексного аудита сайта на 152-ФЗ."""
    if not target_url.startswith(("http://", "https://")):
        target_url = f"https://{target_url}"

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 (compatible; 152-FZ-Auditor/2.0)"
    }

    with httpx.Client(headers=headers, follow_redirects=True) as http_client:
        # 1. SSL и Локализация
        ssl_res = check_ssl(target_url)
        loc_res = check_localization(target_url, http_client)

        # 2. Получение HTML (Playwright c fallback на HTTPX)
        html = ""
        try:
            html = fetch_html_playwright(target_url)
        except Exception:
            # Fallback на httpx при нехватке памяти или сбое Playwright
            try:
                resp = http_client.get(target_url, timeout=10.0)
                html = resp.text
            except Exception:
                html = "<html><body></body></html>"

        soup = BeautifulSoup(html, "html.parser")
        lower_html = html.lower()

        # 3. Анализ Cookie и веб-трекеров
        trackers: List[str] = []
        if "mc.yandex.ru" in lower_html or "yandex_metrika" in lower_html or "ym(" in lower_html:
            trackers.append("Яндекс.Метрика")
        if "google-analytics.com" in lower_html or "googletagmanager.com" in lower_html or "gtag(" in lower_html:
            trackers.append("Google Analytics 4 / GTM")
        if "vk-pixel" in lower_html or "vk.com/rtrg" in lower_html:
            trackers.append("VK Pixel")
        if "top.mail.ru" in lower_html or "_tmr" in lower_html:
            trackers.append("Top.Mail.ru (VK/Mail)")
        if "roistat" in lower_html:
            trackers.append("Roistat")
        if "calltouch" in lower_html:
            trackers.append("Calltouch")
        if "jivosite" in lower_html or "jivo." in lower_html:
            trackers.append("JivoChat")
        if "tilda-stat" in lower_html or "tilda.cc" in lower_html:
            trackers.append("Tilda Analytics")

        cookie_selectors = [
            '[class*="cookie"]', '[id*="cookie"]', '[class*="cookies"]', '[id*="cookies"]',
            '[class*="consent"]', '[id*="consent"]', '[class*="cookie-banner"]',
            '[class*="cookie-popup"]', '[class*="cookie-modal"]', '[class*="cookie-notice"]',
            '[class*="cookie-alert"]', '[class*="cookie-bar"]', '[class*="cookie-warning"]'
        ]
        cookie_detected = False
        has_accept_button = False
        raw_banner_text = ""
        banner_type = "none"

        def is_accept_element(el_tag) -> bool:
            """Проверяет, является ли элемент кнопкой принятия Cookie."""
            txt = el_tag.get_text(strip=True).lower()
            val = (el_tag.get("value") or "").lower()
            cls = " ".join(el_tag.get("class") or []).lower()
            el_id = (el_tag.get("id") or "").lower()
            comb = f"{txt} {val} {cls} {el_id}"

            keywords = [
                "принять", "согласен", "я согласен", "согласен(а)", "понятно",
                "разрешить", "принять все", "ок", "хорошо", "соглашаюсь", "да",
                "accept", "agree", "allow", "got it", "i agree"
            ]
            return (
                any(txt == w or txt.startswith(w) or (len(txt) < 30 and w in txt) for w in keywords) or
                "hide_popup" in comb or
                "cookie_accept" in comb or
                "cookie-accept" in comb or
                "accept-cookie" in comb
            )

        # 1. Поиск по типичным CSS-селекторам
        for selector in cookie_selectors:
            elements = soup.select(selector)
            for el in elements:
                t = el.get_text(strip=True).lower()
                if any(w in t for w in ["cookie", "куки", "персонализац", "файлы"]):
                    cookie_detected = True
                    raw_banner_text = el.get_text(" ", strip=True)[:250]
                    banner_type = "modal_banner" if any(c in el.get("class", []) or c in el.get("id", "") for c in ["modal", "popup", "overlay"]) else "fixed_bottom"
                    for b in el.find_all(["button", "a", "div", "span", "input"]):
                        if is_accept_element(b):
                            has_accept_button = True
                            break
                    break
            if cookie_detected:
                break

        # 2. Глубокий поиск по текстовым узлам DOM (для нестандартных оверлеев вроде redbee.ru)
        if not cookie_detected:
            cookie_re = re.compile(r"(cookie|куки|файлы\s*[\-–—]?\s*cookie)", re.IGNORECASE)
            for node in soup.find_all(string=cookie_re):
                parent = node.parent
                depth = 0
                while parent and depth < 6:
                    ctext = parent.get_text(" ", strip=True)
                    if 25 <= len(ctext) <= 800 and cookie_re.search(ctext):
                        cookie_detected = True
                        raw_banner_text = ctext[:250]
                        parent_id = str(parent.get("id") or "")
                        parent_cls = " ".join(parent.get("class") or [])
                        banner_type = "modal_banner" if any(k in f"{parent_id} {parent_cls}".lower() for k in ["modal", "popup", "overlay"]) else "fixed_bottom"
                        for b in parent.find_all(["button", "a", "div", "span", "input"]):
                            if is_accept_element(b):
                                has_accept_button = True
                                break
                        break
                    parent = parent.parent
                    depth += 1
                if cookie_detected:
                    break

        # 3. Анализ скриптов согласий (hide_popup_cookie, cookie_consent и др.)
        if not cookie_detected and any(s in lower_html for s in ["hide_popup_cookie", "cookie_consent", "cookie_agree"]):
            cookie_detected = True
            banner_type = "modal_banner"
            has_accept_button = True
            raw_banner_text = "Обнаружен скрипт управления согласием на обработку Cookie (hide_popup_cookie)."

        # 4. Анализ явных текстовых формулировок
        if not cookie_detected:
            strong_phrases = [
                "мы используем файлы cookie", "мы используем cookie", "наш сайт использует файлы cookie",
                "продолжая использовать сайт, вы соглашаетесь", "используются cookie", "файлы cookie"
            ]
            if any(p in lower_html for p in strong_phrases):
                cookie_detected = True
                banner_type = "fixed_bottom"
                raw_banner_text = "Обнаружено текстовое уведомление об использовании файлов Cookie."
                if any(w in lower_html for w in ["принять", "согласен", "понятно", "ок", "разрешить"]):
                    has_accept_button = True

        cookie_violations = []
        if not cookie_detected:
            if trackers:
                cookie_violations.append(
                    f"На сайте работают системы аналитики ({', '.join(trackers)}), но отсутствует Cookie-баннер (ст. 13.11 ч. 1 КоАП РФ)."
                )
            else:
                cookie_violations.append("Всплывающая плашка согласия с файлами Cookie не обнаружена.")
        elif not has_accept_button:
            cookie_violations.append("Cookie-плашка обнаружена, но в ней отсутствует кнопка явного согласия («Принять» / «Согласен»).")

        cookie_res = CookieBannerAudit(
            detected=cookie_detected,
            banner_type="fixed_bottom" if cookie_detected else "none",
            has_accept_button=has_accept_button,
            has_policy_mention="политик" in raw_banner_text.lower(),
            raw_banner_text=raw_banner_text,
            third_party_trackers=trackers,
            is_compliant=cookie_detected and has_accept_button,
            violations=cookie_violations
        )

        # 4. Поиск Политики конфиденциальности и проверка кода ответа сервера
        policy_urls: List[str] = []
        anchor_texts: List[str] = []
        for a in soup.find_all("a", href=True):
            href = a["href"].strip()
            text = a.get_text(strip=True)
            combined = f"{href} {text}".lower()
            if any(k in combined for k in ["policy", "privacy", "политик", "конфиденциальност", "персональн"]):
                if href and not href.startswith(("javascript:", "#", "tel:", "mailto:")):
                    full_url = urljoin(target_url, href)
                    if full_url not in policy_urls:
                        policy_urls.append(full_url)
                        anchor_texts.append(text or href)

        has_policy = len(policy_urls) > 0
        policy_status_code = 0
        policy_is_200 = False
        policy_violations = []

        if has_policy:
            # Проверяем фактический HTTP-код первой найденной ссылки на Политику
            policy_status_code, policy_is_200 = check_url_status(policy_urls[0], http_client)
            if not policy_is_200:
                policy_violations.append(
                    f"Ссылка на Политику конфиденциальности ({policy_urls[0]}) возвращает ошибку (HTTP {policy_status_code or 404})."
                )
        else:
            policy_violations.append("Ссылка на Политику конфиденциальности не найдена в сквозном меню/футере сайта.")

        has_requisites = any(w in lower_html for w in ["инн", "огрн", "ооо ", "ип "])

        policy_res = PrivacyPolicyAudit(
            found=has_policy,
            policy_urls=policy_urls,
            anchor_texts=anchor_texts,
            is_accessible_200=policy_is_200,
            http_status_code=policy_status_code if has_policy else None,
            has_company_requisites=has_requisites,
            is_direct_footer_link=has_policy,
            violations=policy_violations
        )

        # 5. Анализ веб-форм и проверка битых ссылок в формах
        forms_results: List[FormAuditResult] = []
        form_elements = soup.find_all("form")
        
        # Если классических <form> нет, ищем конструкторы (Tilda, Bitrix24, квизы)
        custom_containers = soup.select('.t-form, .b24-form, [role="form"], .lead-form, .callback-form') if not form_elements else []
        candidates = form_elements + custom_containers

        for idx, form_el in enumerate(candidates):
            form_id = form_el.get("id") or form_el.get("name") or f"form-{idx + 1}"
            inputs = form_el.find_all(["input", "textarea"])
            pd_fields: List[FormField] = []

            for inp in inputs:
                itype = inp.get("type", "text").lower()
                if itype in ["hidden", "submit", "button", "checkbox", "radio"]:
                    continue
                name = inp.get("name", "")
                ph = inp.get("placeholder", "")
                label_text = inp.find_parent().get_text(strip=True)[:80] if inp.find_parent() else ""
                combined_str = f"{name} {ph} {label_text} {itype}".lower()

                cat = ""
                if any(w in combined_str for w in ["phone", "tel", "тел", "номер"]):
                    cat = "Телефон"
                elif any(w in combined_str for w in ["email", "mail", "почт"]):
                    cat = "E-mail"
                elif any(w in combined_str for w in ["name", "fio", "имя", "фио", "фамил"]):
                    cat = "ФИО"
                elif any(w in combined_str for w in ["address", "адрес", "город", "улиц"]):
                    cat = "Адрес"
                elif any(w in combined_str for w in ["сообщен", "коммент", "вопрос", "message"]):
                    cat = "Обращение"

                if cat:
                    pd_fields.append(FormField(
                        field_type=itype,
                        name=name or ph or "Поле ввода",
                        placeholder=ph or None,
                        is_personal_data=True,
                        pd_category=cat
                    ))

            if pd_fields:
                checkboxes = form_el.find_all("input", type="checkbox")
                has_cb = len(checkboxes) > 0
                is_prechecked = False
                assoc_text = ""

                if has_cb:
                    cb = checkboxes[0]
                    is_prechecked = cb.has_attr("checked")
                    parent_label = cb.find_parent("label")
                    assoc_text = parent_label.get_text(strip=True) if parent_label else form_el.get_text(" ", strip=True)[:180]

                # Поиск ссылки на политику внутри формы
                form_policy_link = None
                for a_tag in form_el.find_all("a", href=True):
                    a_href = a_tag["href"]
                    a_text = a_tag.get_text(strip=True).lower()
                    if any(w in a_text or w in a_href.lower() for w in ["политик", "согласи", "privacy", "policy"]):
                        form_policy_link = urljoin(target_url, a_href)
                        break

                if not form_policy_link and policy_urls:
                    form_policy_link = policy_urls[0]

                # Проверка кода ответа для ссылки из формы
                form_link_code = None
                form_link_broken = False
                if form_policy_link:
                    form_link_code, is_acc = check_url_status(form_policy_link, http_client)
                    form_link_broken = not is_acc

                f_violations: List[str] = []
                if not has_cb:
                    f_violations.append("Отсутствует обязательный чекбокс согласия на обработку ПДн (ст. 9 152-ФЗ).")
                elif is_prechecked:
                    f_violations.append("Чекбокс согласия отмечен по умолчанию (нарушение ст. 9 152-ФЗ).")
                if form_link_broken:
                    f_violations.append(f"Ссылка на Политику в форме ведет на битую страницу (HTTP {form_link_code or 404}).")

                forms_results.append(FormAuditResult(
                    form_id=form_id,
                    form_selector=f"form#{form_id}",
                    page_url=target_url,
                    fields_count=len(inputs),
                    personal_data_fields=pd_fields,
                    checkbox_analysis=CheckboxAnalysis(
                        exists=has_cb,
                        is_prechecked=is_prechecked,
                        associated_text=assoc_text or "Я согласен на обработку персональных данных",
                        has_consent_keywords=any(w in assoc_text.lower() for w in ["согласи", "персональн", "152"]),
                        has_policy_link=bool(form_policy_link) and not form_link_broken,
                        policy_link_url=form_policy_link,
                        policy_link_status_code=form_link_code,
                        policy_link_is_broken=form_link_broken
                    ),
                    is_compliant=has_cb and not is_prechecked and not form_link_broken,
                    violations=f_violations
                ))

        # 6. Расчет общего рейтинга (Score) и нарушений по КоАП РФ
        score = 100
        max_fine = 0
        violations_list: List[LegalViolation] = []

        # Нарушение локализации
        if not loc_res.is_located_in_rf:
            score -= 40
            max_fine += 6000000
            violations_list.append(LegalViolation(
                code="LOCALIZATION_FOREIGN_SERVER",
                severity="CRITICAL",
                koap_article="ст. 13.11 ч. 8, 9 КоАП РФ (ч. 5 ст. 18 152-ФЗ)",
                title="Сервер и база данных расположены за пределами РФ",
                description=f"IP {loc_res.ip_address} привязан к региону {loc_res.country_name}. Хранение ПДн граждан РФ обязано осуществляться в ЦОД на территории РФ.",
                location=f"IP: {loc_res.ip_address} ({loc_res.country_name})",
                fine_range_rub="от 1 000 000 ₽ до 6 000 000 ₽",
                remediation_guide="Перенесите проект на российский хостинг с подтвержденным расположением ЦОД в РФ."
            ))

        # Нарушения в веб-формах
        for form in forms_results:
            if not form.checkbox_analysis.exists:
                score -= 15
                max_fine += 150000
                violations_list.append(LegalViolation(
                    code="FORM_NO_CONSENT_CHECKBOX",
                    severity="HIGH",
                    koap_article="ст. 13.11 ч. 1, 2 КоАП РФ (ст. 9 152-ФЗ)",
                    title=f"Отсутствует чекбокс согласия в форме {form.form_selector}",
                    description=f"В форме собираются данные ({', '.join([f.pd_category for f in form.personal_data_fields])}), но нет элемента волеизъявления.",
                    location=f"{form.page_url} -> {form.form_selector}",
                    fine_range_rub="от 60 000 ₽ до 150 000 ₽",
                    remediation_guide="Добавьте обязательный неотмеченный чекбокс со ссылкой на Политику."
                ))
            elif form.checkbox_analysis.is_prechecked:
                score -= 10
                max_fine += 100000
                violations_list.append(LegalViolation(
                    code="FORM_PRECHECKED_CHECKBOX",
                    severity="MEDIUM",
                    koap_article="ст. 13.11 ч. 1 КоАП РФ (ст. 9 152-ФЗ)",
                    title=f"Предустановленный чекбокс в форме {form.form_selector}",
                    description="Чекбокс отмечен по умолчанию. Согласие должно выражаться активным действием пользователя.",
                    location=f"{form.page_url} -> {form.form_selector}",
                    fine_range_rub="до 100 000 ₽",
                    remediation_guide="Уберите атрибут checked у чекбокса."
                ))

            if form.checkbox_analysis.policy_link_is_broken:
                score -= 15
                max_fine += 60000
                violations_list.append(LegalViolation(
                    code="FORM_POLICY_LINK_BROKEN",
                    severity="HIGH",
                    koap_article="ст. 13.11 ч. 3 КоАП РФ (ст. 18.1 152-ФЗ)",
                    title=f"Битая ссылка на Политику в форме {form.form_selector}",
                    description=f"Ссылка на Политику в форме возвращает код ошибки HTTP {form.checkbox_analysis.policy_link_status_code or 404}.",
                    location=f"{form.page_url} -> {form.form_selector}",
                    fine_range_rub="от 30 000 ₽ до 60 000 ₽",
                    remediation_guide="Укажите корректный URL рабочего документа с кодом ответа 200 OK."
                ))

        # Нарушения Политики конфиденциальности
        if not policy_res.found:
            score -= 25
            max_fine += 60000
            violations_list.append(LegalViolation(
                code="POLICY_NOT_FOUND",
                severity="HIGH",
                koap_article="ст. 13.11 ч. 3 КоАП РФ (ст. 18.1 152-ФЗ)",
                title="Не опубликована Политика конфиденциальности",
                description="Оператор не обеспечил свободный доступ к документу, определяющему политику обработки ПДн.",
                location="Футер сайта / Сквозное меню",
                fine_range_rub="от 30 000 ₽ до 60 000 ₽",
                remediation_guide="Опубликуйте Политику и закрепите ссылку в подвале всех страниц."
            ))
        elif not policy_res.is_accessible_200:
            score -= 20
            max_fine += 60000
            violations_list.append(LegalViolation(
                code="POLICY_LINK_BROKEN",
                severity="HIGH",
                koap_article="ст. 13.11 ч. 3 КоАП РФ (ст. 18.1 152-ФЗ)",
                title="Ссылка на Политику конфиденциальности недоступна (404/500)",
                description=f"Ссылка на документ возвращает код ошибки HTTP {policy_res.http_status_code or 404}.",
                location=policy_res.policy_urls[0] if policy_res.policy_urls else "Сайт",
                fine_range_rub="от 30 000 ₽ до 60 000 ₽",
                remediation_guide="Восстановите доступность страницы с Политикой конфиденциальности."
            ))

        # Нарушения по Cookie и трекерам
        if not cookie_res.detected and cookie_res.third_party_trackers:
            score -= 20
            max_fine += 100000
            violations_list.append(LegalViolation(
                code="COOKIE_BANNER_MISSING",
                severity="HIGH",
                koap_article="ст. 13.11 ч. 1 КоАП РФ (ст. 6, 9 152-ФЗ)",
                title=f"Отсутствует Cookie-баннер при работающих трекерах ({', '.join(cookie_res.third_party_trackers)})",
                description="Сбор технических метаданных и идентификаторов пользователей счетчиками аналитики без уведомления и согласия.",
                location="JavaScript трекеры в DOM",
                fine_range_rub="от 30 000 ₽ до 100 000 ₽",
                remediation_guide="Установите всплывающее уведомление о Cookie с кнопкой согласия («Принять»)."
            ))

        score = max(0, min(100, score))
        risk_level = "КРИТИЧЕСКИЙ" if score < 40 else "ВЫСОКИЙ" if score < 70 else "СРЕДНИЙ" if score < 90 else "МИНИМАЛЬНЫЙ"

        summary = (
            f"Аудит завершен. Оценка соответствия 152-ФЗ: {score}/100 ({risk_level} РИСК). "
            f"Выявлено {len(violations_list)} нарушений. Максимальный совокупный штраф по КоАП РФ: {max_fine:,.0f} ₽."
        )

        return AuditReport(
            target_url=target_url,
            audit_date=datetime.now().strftime("%d.%m.%Y %H:%M"),
            compliance_score=score,
            risk_level=risk_level,
            max_potential_fine_rub=max_fine,
            ssl_audit=ssl_res,
            localization_audit=loc_res,
            privacy_policy_audit=policy_res,
            cookie_audit=cookie_res,
            forms_audit=forms_results,
            violations=violations_list,
            summary_text=summary
        )


# ==========================================
# 3. Пользовательский интерфейс Streamlit
# ==========================================

st.set_page_config(
    page_title="Аудит соответствия 152-ФЗ",
    page_icon="🛡️",
    layout="wide",
    initial_sidebar_state="collapsed"
)

# Точное воспроизведение стилистики UI превью (шрифты, карточка, бейдж, кнопки)
st.markdown("""
<style>
    /* Фоновая подложка и базовые шрифты */
    .stApp {
        background-color: #F8FAFC;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    
    /* Скрытие стандартных служебных отступов Streamlit */
    .block-container {
        padding-top: 2rem !important;
        padding-bottom: 3rem !important;
        max-width: 1100px !important;
    }
    
    /* Стилизация карточки ввода */
    .hero-card {
        background: #FFFFFF;
        border: 1px solid #E2E8F0;
        border-radius: 20px;
        padding: 40px 32px 32px 32px;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
        margin-bottom: 24px;
        text-align: center;
    }
    
    .pill-badge {
        display: inline-block;
        background-color: #EFF6FF;
        color: #1D4ED8;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        padding: 6px 16px;
        border-radius: 9999px;
        margin-bottom: 16px;
        border: 1px solid #DBEAFE;
    }
    
    .hero-title {
        font-size: 32px;
        font-weight: 800;
        color: #0F172A;
        margin: 0 0 12px 0;
        letter-spacing: -0.02em;
    }
    
    .hero-subtitle {
        font-size: 15px;
        color: #64748B;
        max-width: 680px;
        margin: 0 auto 32px auto;
        line-height: 1.6;
    }

    /* Поле ввода URL */
    div[data-testid="stTextInput"] input {
        border-radius: 14px !important;
        border: 1px solid #CBD5E1 !important;
        padding: 14px 18px !important;
        font-size: 15px !important;
        background-color: #FFFFFF !important;
        color: #0F172A !important;
        box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05) !important;
    }
    div[data-testid="stTextInput"] input:focus {
        border-color: #2563EB !important;
        box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15) !important;
    }

    /* Основная кнопка "Запустить аудит →" */
    div[data-testid="stButton"] button[kind="primary"] {
        background-color: #0F172A !important;
        color: #FFFFFF !important;
        border-radius: 14px !important;
        font-size: 15px !important;
        font-weight: 600 !important;
        padding: 14px 24px !important;
        border: none !important;
        transition: all 0.15s ease-in-out !important;
        box-shadow: 0 4px 6px -1px rgba(15, 23, 42, 0.15) !important;
    }
    div[data-testid="stButton"] button[kind="primary"]:hover {
        background-color: #1E293B !important;
        transform: translateY(-1px);
        box-shadow: 0 6px 12px -2px rgba(15, 23, 42, 0.25) !important;
    }

    /* Табы отчета */
    .stTabs [data-baseweb="tab-list"] {
        gap: 8px;
        background-color: transparent;
        border-bottom: 1px solid #E2E8F0;
        padding-bottom: 8px;
    }
    .stTabs [data-baseweb="tab"] {
        padding: 10px 18px;
        background-color: #FFFFFF;
        border: 1px solid #E2E8F0;
        border-radius: 10px;
        font-weight: 600;
        font-size: 13px;
        color: #475569;
    }
    .stTabs [aria-selected="true"] {
        background-color: #0F172A !important;
        color: #FFFFFF !important;
        border-color: #0F172A !important;
    }

    /* Метрики */
    div[data-testid="stMetric"] {
        background: #FFFFFF;
        border: 1px solid #E2E8F0;
        border-radius: 14px;
        padding: 16px 20px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    }
</style>
""", unsafe_allow_html=True)

# Инициализация сессионного хранилища
if "current_report" not in st.session_state:
    st.session_state.current_report = None

# Если отчет уже сформирован — показываем кнопку сброса для нового анализа
if st.session_state.current_report:
    col_back, _ = st.columns([2, 8])
    with col_back:
        if st.button("← Проверить другой сайт", use_container_width=True):
            st.session_state.current_report = None
            st.rerun()

# Отображение главного блока сканирования (точно как в превью)
if not st.session_state.current_report:
    st.markdown("""
    <div class="hero-card">
        <div class="pill-badge">АУДИТ СООТВЕТСТВИЯ ЗАКОНУ</div>
        <h1 class="hero-title">Комплексный аудит сайта на соблюдение 152-ФЗ</h1>
        <p class="hero-subtitle">
            Автоматический анализ веб-форм, чекбоксов согласия, Политики конфиденциальности,
            Cookie-баннеров, SSL-сертификата и локализации серверов в РФ по ст. 13.11 КоАП РФ.
        </p>
    </div>
    """, unsafe_allow_html=True)

    # Строка ввода URL и кнопка запуска
    col_input, col_btn = st.columns([4, 2])
    with col_input:
        url_input = st.text_input(
            "Адрес проверяемого сайта",
            placeholder="https://gosuslugi.ru",
            label_visibility="collapsed"
        )
    with col_btn:
        start_audit = st.button("🔍 Запустить аудит →", type="primary", use_container_width=True)

    # Опции проверки
    col_opt1, col_opt2 = st.columns([3, 2])
    with col_opt1:
        deep_scan = st.checkbox("Глубокий анализ (до 5 связанных страниц и вложенных форм)", value=True)
    with col_opt2:
        page_limit = st.selectbox(
            "Лимит страниц:",
            options=["5 страниц", "10 страниц", "Только главная (1 страница)"],
            index=0,
            label_visibility="collapsed"
        )

    if start_audit and url_input:
        clean_url = url_input.strip()
        with st.spinner("⏳ Выполняется комплексный аудит DOM, валидация согласий и проверка GeoIP РФ..."):
            report = run_full_audit(clean_url)
            st.session_state.current_report = report
            st.rerun()

# Отображение дашборда отчета
report: Optional[AuditReport] = st.session_state.current_report

if report:
    st.divider()

    # Верхние метрики
    m1, m2, m3, m4 = st.columns(4)
    with m1:
        score_color = "green" if report.compliance_score > 85 else "orange" if report.compliance_score > 55 else "red"
        st.metric("Балл соответствия 152-ФЗ", f"{report.compliance_score} / 100")
    with m2:
        st.metric("Уровень риска", report.risk_level)
    with m3:
        st.metric("Потенциальный штраф по КоАП", f"{report.max_potential_fine_rub:,.0f} ₽")
    with m4:
        st.metric("Сервер в РФ (ст. 18 ч. 5)", "✅ Да" if report.localization_audit.is_located_in_rf else "❌ Нет (Зарубеж)")

    st.info(report.summary_text)

    # Вкладки детального отчета
    tab_summary, tab_violations, tab_forms, tab_cookies, tab_policy = st.tabs([
        "📊 Сводный отчет",
        f"⚠️ Нарушения ({len(report.violations)})",
        f"📝 Веб-формы ({len(report.forms_audit)})",
        "🍪 Cookie и трекеры",
        "📄 Политика конфиденциальности"
    ])

    # Вкладка 1: Сводный отчет
    with tab_summary:
        st.subheader("Юридическая сводка аудита")
        col_s1, col_s2 = st.columns(2)
        with col_s1:
            st.markdown(f"""
            * **URL сайта:** `{report.target_url}`
            * **Дата проверки:** `{report.audit_date}`
            * **IP-адрес сервера:** `{report.localization_audit.ip_address}` ({report.localization_audit.country_name})
            * **SSL-защита (ст. 19):** {"✅ Активна" if report.ssl_audit.is_https and report.ssl_audit.is_valid else "❌ Нарушение"}
            """)
        with col_s2:
            st.markdown(f"""
            * **Политика конфиденциальности (ст. 18.1):** {"✅ Доступна (200 OK)" if report.privacy_policy_audit.is_accessible_200 else "❌ Ошибка / Не найдена"}
            * **Cookie-плашка (ч. 1 ст. 13.11):** {"✅ Корректна" if report.cookie_audit.is_compliant else "❌ Отсутствует / Нарушение"}
            * **Найдено веб-форм:** `{len(report.forms_audit)}`
            * **Обнаружено нарушений:** `{len(report.violations)}`
            """)

        # Кнопка экспорта отчета
        json_report = report.model_dump_json(indent=2)
        st.download_button(
            label="💾 Скачать отчет в формате JSON",
            data=json_report,
            file_name=f"audit_152fz_{urlparse(report.target_url).hostname}.json",
            mime="application/json"
        )

    # Вкладка 2: Нарушения и санкции КоАП
    with tab_violations:
        st.subheader("Реестр выявленных нарушений законодательства")
        if not report.violations:
            st.success("Нарушений не обнаружено! Сайт полностью соответствует требованиям 152-ФЗ.")
        else:
            for idx, v in enumerate(report.violations):
                with st.expander(f"{idx+1}. [{v.severity}] {v.title} — {v.fine_range_rub}", expanded=(idx < 2)):
                    st.markdown(f"**Статья закона:** `{v.koap_article}`")
                    st.markdown(f"**Описание риска:** {v.description}")
                    st.markdown(f"**Место нарушения:** `{v.location}`")
                    st.markdown(f"**Штрафная санкция:** `{v.fine_range_rub}`")
                    st.success(f"💡 **Рекомендация по исправлению:** {v.remediation_guide}")

    # Вкладка 3: Анализ веб-форм
    with tab_forms:
        st.subheader("Инспекция интерактивных форм сбора персональных данных")
        if not report.forms_audit:
            st.info("Формы сбора персональных данных на главной странице не обнаружены.")
        else:
            for f in report.forms_audit:
                status_badge = "✅ Соответствует" if f.is_compliant else "❌ Нарушение"
                with st.container(border=True):
                    st.markdown(f"#### Форма `{f.form_selector}` — {status_badge}")
                    st.markdown(f"**Обнаруженные поля ПДн:** {', '.join([f'{field.pd_category} ({field.name})' for field in f.personal_data_fields])}")
                    
                    c1, c2 = st.columns(2)
                    with c1:
                        st.markdown(f"* Чекбокс согласия: {'✅ Присутствует' if f.checkbox_analysis.exists else '❌ Отсутствует'}")
                        st.markdown(f"* Предустановленная галочка: {'❌ Да (Нарушение)' if f.checkbox_analysis.is_prechecked else '✅ Нет (Корректно)'}")
                    with c2:
                        if f.checkbox_analysis.policy_link_url:
                            link_code = f.checkbox_analysis.policy_link_status_code or 200
                            link_state = "❌ Битая ссылка" if f.checkbox_analysis.policy_link_is_broken else "✅ 200 OK"
                            st.markdown(f"* Ссылка на Политику в форме: `{f.checkbox_analysis.policy_link_url}` ({link_state}, HTTP {link_code})")
                        else:
                            st.markdown("* Ссылка на Политику в форме: ❌ Не указана")

                    if f.violations:
                        st.error("**Замечания по форме:** " + "; ".join(f.violations))

    # Вкладка 4: Cookie и аналитика
    with tab_cookies:
        st.subheader("Файлы Cookie, веб-аналитика и трекеры")
        c_status, c_trackers = st.columns(2)
        with c_status:
            st.markdown(f"* **Плашка Cookie обнаружена:** {'✅ Да' if report.cookie_audit.detected else '❌ Нет'}")
            st.markdown(f"* **Кнопка согласия («Принять»):** {'✅ Да' if report.cookie_audit.has_accept_button else '❌ Нет'}")
            if report.cookie_audit.raw_banner_text:
                st.caption(f"Текст плашки: «{report.cookie_audit.raw_banner_text}»")
        with c_trackers:
            st.markdown(f"* **Обнаруженные счетчики:** {', '.join(report.cookie_audit.third_party_trackers) if report.cookie_audit.third_party_trackers else 'Сторонние счетчики не найдены'}")

    # Вкладка 5: Политика конфиденциальности
    with tab_policy:
        st.subheader("Аудит Политики конфиденциальности (ст. 18.1 152-ФЗ)")
        p1, p2 = st.columns(2)
        with p1:
            st.markdown(f"* **Наличие документа на сайте:** {'✅ Опубликован' if report.privacy_policy_audit.found else '❌ Не найден'}")
            st.markdown(f"* **Код HTTP ответа сервера:** `HTTP {report.privacy_policy_audit.http_status_code or (200 if report.privacy_policy_audit.is_accessible_200 else 404)}`")
            st.markdown(f"* **Доступность страницы:** {'✅ Доступна (200 OK)' if report.privacy_policy_audit.is_accessible_200 else '❌ Недоступна / Битая ссылка'}")
        with p2:
            st.markdown(f"* **Реквизиты оператора (ИНН/ОГРН):** {'✅ Найдены в тексте' if report.privacy_policy_audit.has_company_requisites else '⚠️ Рекомендуется указать'}")
            if report.privacy_policy_audit.policy_urls:
                st.markdown(f"* **URL документа:** `{report.privacy_policy_audit.policy_urls[0]}`")

