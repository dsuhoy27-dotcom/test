import asyncio
import re
import socket
import ssl
from typing import List, Tuple, Optional, Dict, Any
from urllib.parse import urljoin, urlparse
import httpx
from bs4 import BeautifulSoup
from playwright.async_api import async_playwright, Browser, Page

from app.schemas.audit import (
    FormField,
    CheckboxAnalysis,
    FormAuditResult,
    PrivacyPolicyAudit,
    CookieBannerAudit,
    SslAudit,
    LocalizationAudit,
)


class WebsiteParserService:
    """Асинхронный сервис парсинга сайтов на базе Playwright и BeautifulSoup."""

    PD_KEYWORDS = {
        "fio": ["fio", "name", "фио", "имя", "фамилия", "отчество", "fullname", "first_name", "last_name", "user_name"],
        "phone": ["phone", "tel", "телефон", "номер", "mobile", "тел", "whatsapp", "call"],
        "email": ["email", "e-mail", "mail", "почта", "электронная"],
        "address": ["address", "адрес", "город", "улица", "дом", "доставка", "city", "street"],
        "passport": ["passport", "паспорт", "серия", "snils", "снилс", "inn", "инн", "документ"],
    }

    CONSENT_KEYWORDS = [
        "согласие", "согласен", "согласна", "соглашаюсь", "обработку", "персональных",
        "персональные", "152-фз", "152 фз", "данных", "политикой", "политика", "конфиденциальности"
    ]

    COOKIE_KEYWORDS = [
        "cookie", "куки", "файлы cookie", "файлов cookie", "cookie-файлы",
        "cookies", "мы используем cookie", "персонализации сервисов"
    ]

    POLICY_LINK_PATTERNS = [
        re.compile(r"policy", re.IGNORECASE),
        re.compile(r"privacy", re.IGNORECASE),
        re.compile(r"политик[а-я]*", re.IGNORECASE),
        re.compile(r"конфиденциальност[а-я]*", re.IGNORECASE),
        re.compile(r"персональн[а-я]*", re.IGNORECASE),
        re.compile(r"согласи[ея]", re.IGNORECASE),
        re.compile(r"обработк[а-я]", re.IGNORECASE),
    ]

    @classmethod
    async def analyze_ssl(cls, url: str) -> SslAudit:
        """Проверка наличия, валидности и срока действия SSL-сертификата."""
        parsed = urlparse(url)
        if parsed.scheme != "https":
            return SslAudit(
                is_https=False,
                is_valid=False,
                violations=["Сайт работает по незащищенному протоколу HTTP"]
            )

        hostname = parsed.hostname or url
        port = parsed.port or 443

        try:
            context = ssl.create_default_context()
            # Установка таймаута на сокет
            loop = asyncio.get_running_loop()

            def _get_cert_info():
                with socket.create_connection((hostname, port), timeout=5) as sock:
                    with context.wrap_socket(sock, server_hostname=hostname) as ssock:
                        cert = ssock.getpeercert()
                        cipher = ssock.cipher()
                        version = ssock.version()
                        return cert, cipher, version

            cert, cipher, version = await loop.run_in_executor(None, _get_cert_info)

            # Извлечение информации
            issuer = dict(x[0] for x in cert.get("issuer", []))
            issuer_org = issuer.get("organizationName", issuer.get("commonName", "Unknown Issuer"))
            not_after_str = cert.get("notAfter", "")

            # Расчет оставшихся дней
            import email.utils
            from datetime import datetime, timezone
            expire_tuple = email.utils.parsedate_to_datetime(not_after_str)
            days_left = (expire_tuple - datetime.now(timezone.utc)).days

            is_valid = days_left > 0
            violations = []
            if days_left < 14:
                violations.append(f"Срок действия SSL-сертификата истекает через {days_left} дн.")

            return SslAudit(
                is_https=True,
                is_valid=is_valid,
                issuer=issuer_org,
                valid_to=not_after_str,
                days_left=days_left,
                protocols=[version, cipher[0]] if cipher else [version],
                violations=violations
            )
        except Exception as e:
            return SslAudit(
                is_https=True,
                is_valid=False,
                violations=[f"Ошибка проверки SSL-сертификата: {str(e)}"]
            )

    @classmethod
    async def analyze_localization(cls, url: str) -> LocalizationAudit:
        """Определение IP-адреса и страны расположения сервера (РФ)."""
        hostname = urlparse(url).hostname or url
        loop = asyncio.get_running_loop()

        try:
            ip_info = await loop.run_in_executor(None, socket.gethostbyname, hostname)
        except Exception as e:
            return LocalizationAudit(
                ip_address=None,
                hostname=hostname,
                is_located_in_rf=False,
                violations=[f"Не удалось разрешить DNS для {hostname}: {str(e)}"]
            )

        # GeoIP проверка через публичный сервис
        try:
            async with httpx.AsyncClient(timeout=6.0) as client:
                resp = await client.get(f"https://ipapi.co/{ip_info}/json/")
                if resp.status_code == 200:
                    data = resp.json()
                    country_code = data.get("country_code", "").upper()
                    country_name = data.get("country_name", "")
                    city = data.get("city", "")
                    org = data.get("org", "")

                    is_rf = country_code in ("RU", "RUS")
                    violations = []
                    if not is_rf:
                        violations.append(
                            f"Сервер находится за пределами РФ ({country_name}, {country_code}). "
                            "Нарушение ч. 5 ст. 18 152-ФЗ."
                        )

                    return LocalizationAudit(
                        ip_address=ip_info,
                        hostname=hostname,
                        country_code=country_code,
                        country_name=country_name,
                        city=city,
                        isp=org,
                        is_located_in_rf=is_rf,
                        violations=violations
                    )
        except Exception:
            pass

        # Fallback если внешний сервис недоступен
        # Проверяем TLD .ru, .рф как эвристику
        is_rf_tld = hostname.endswith((".ru", ".рф", ".su"))
        return LocalizationAudit(
            ip_address=ip_info,
            hostname=hostname,
            country_code="RU" if is_rf_tld else "UNKNOWN",
            country_name="Россия" if is_rf_tld else "Не определено",
            is_located_in_rf=is_rf_tld,
            violations=[] if is_rf_tld else ["Требуется ручная верификация дата-центра"]
        )

    @classmethod
    async def scan_pages_playwright(
        cls,
        base_url: str,
        max_pages: int = 5,
        status_callback=None
    ) -> Tuple[List[str], List[FormAuditResult], PrivacyPolicyAudit, CookieBannerAudit]:
        """Основной цикл рендеринга в Playwright с анализом DOM и всплывающих окон."""
        discovered_urls: List[str] = [base_url]
        scanned_urls: List[str] = []
        all_forms_results: List[FormAuditResult] = []
        cookie_result = CookieBannerAudit(detected=False)
        found_policy_urls: List[str] = []
        found_policy_anchors: List[str] = []

        async with async_playwright() as p:
            browser: Browser = await p.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-dev-shm-usage"]
            )
            context = await browser.new_context(
                viewport={"width": 1440, "height": 900},
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 152-FZ-Auditor/1.0"
            )
            page: Page = await context.new_page()

            while discovered_urls and len(scanned_urls) < max_pages:
                current_url = discovered_urls.pop(0)
                if current_url in scanned_urls:
                    continue

                if status_callback:
                    await status_callback(f"Анализ DOM-структуры: {current_url}")

                try:
                    await page.goto(current_url, wait_until="domcontentloaded", timeout=20000)
                    await page.wait_for_timeout(1500)  # Дать отработать JS-скриптам и модалкам
                    scanned_urls.append(current_url)

                    # Получаем полный HTML после JS-рендеринга
                    html_content = await page.content()
                    soup = BeautifulSoup(html_content, "lxml")

                    # 1. Поиск вложенных страниц того же домена
                    base_domain = urlparse(base_url).netloc
                    for a_tag in soup.find_all("a", href=True):
                        href = a_tag["href"]
                        full_link = urljoin(current_url, href)
                        parsed_link = urlparse(full_link)
                        if parsed_link.netloc == base_domain and full_link not in scanned_urls and full_link not in discovered_urls:
                            if any(ext in parsed_link.path.lower() for ext in [".jpg", ".png", ".pdf", ".zip", ".css", ".js"]):
                                continue
                            if len(discovered_urls) < max_pages * 2:
                                discovered_urls.append(full_link)

                    # 2. Поиск Cookie-баннеров (плашек с fixed/absolute позицией или текстом про cookie)
                    if not cookie_result.detected:
                        cookie_banner_data = await cls._detect_cookie_banner(page, soup)
                        if cookie_banner_data.detected:
                            cookie_result = cookie_banner_data

                    # 3. Поиск ссылок на Политику конфиденциальности
                    cls._extract_privacy_links(soup, current_url, found_policy_urls, found_policy_anchors)

                    # 4. Анализ всех <form> на странице
                    forms_on_page = cls._analyze_forms(soup, current_url)
                    all_forms_results.extend(forms_on_page)

                except Exception as e:
                    # Логируем ошибку отдельной страницы и продолжаем
                    print(f"Error scanning page {current_url}: {e}")
                    scanned_urls.append(current_url)

            await browser.close()

        # Проверяем доступность найденных ссылок на Политику
        policy_audit = await cls._verify_policy_links(found_policy_urls, found_policy_anchors)

        return scanned_urls, all_forms_results, policy_audit, cookie_result

    @classmethod
    def _analyze_forms(cls, soup: BeautifulSoup, page_url: str) -> List[FormAuditResult]:
        """Извлечение и валидация всех форм на наличие ПДн и чекбоксов согласия."""
        results: List[FormAuditResult] = []
        forms = soup.find_all("form")

        for idx, form in enumerate(forms):
            form_id = form.get("id")
            form_action = form.get("action", "")
            form_selector = f"form#{form_id}" if form_id else f"form[{idx+1}]"

            inputs = form.find_all(["input", "textarea", "select"])
            pd_fields: List[FormField] = []
            checkboxes = form.find_all("input", type="checkbox")

            # Анализ полей ввода
            for inp in inputs:
                inp_type = inp.get("type", "text").lower()
                if inp_type in ("hidden", "submit", "button", "checkbox", "radio", "csrf"):
                    continue

                name = inp.get("name", "")
                placeholder = inp.get("placeholder", "")
                label_text = ""
                if inp.get("id"):
                    lbl = soup.find("label", attrs={"for": inp.get("id")})
                    if lbl:
                        label_text = lbl.get_text(strip=True)

                is_pd, pd_cat = cls._check_is_personal_data(name, placeholder, label_text, inp_type)
                if is_pd:
                    pd_fields.append(
                        FormField(
                            field_type=inp_type,
                            name=name or None,
                            placeholder=placeholder or None,
                            label=label_text or None,
                            is_personal_data=True,
                            pd_category=pd_cat
                        )
                    )

            # Если форма не содержит сбора ПДн, она не подлежит обязательной валидации согласия
            if not pd_fields:
                continue

            # Анализ чекбоксов в форме
            checkbox_analysis = cls._analyze_form_checkboxes(checkboxes, form)

            is_compliant = (
                checkbox_analysis.exists and
                not checkbox_analysis.is_prechecked and
                checkbox_analysis.has_consent_keywords
            )

            violations = []
            if not checkbox_analysis.exists:
                violations.append("Отсутствует обязательный чекбокс согласия")
            elif checkbox_analysis.is_prechecked:
                violations.append("Чекбокс отмечен по умолчанию (нарушение ст. 9 152-ФЗ)")
            if not checkbox_analysis.has_consent_keywords:
                violations.append("Не указан явный текст согласия на обработку ПДн")

            results.append(
                FormAuditResult(
                    page_url=page_url,
                    form_id=form_id,
                    form_action=form_action,
                    form_selector=form_selector,
                    fields_count=len(inputs),
                    personal_data_fields=pd_fields,
                    checkbox_analysis=checkbox_analysis,
                    is_compliant=is_compliant,
                    violations=violations
                )
            )

        return results

    @classmethod
    def _check_is_personal_data(cls, name: str, placeholder: str, label: str, field_type: str) -> Tuple[bool, Optional[str]]:
        """Эвристическое определение категорий ПДн по атрибутам полей."""
        search_text = f"{name} {placeholder} {label} {field_type}".lower()

        for category, keys in cls.PD_KEYWORDS.items():
            if any(k in search_text for k in keys):
                return True, category

        if field_type in ("email", "tel"):
            return True, field_type

        return False, None

    @classmethod
    def _analyze_form_checkboxes(cls, checkboxes: list, form: BeautifulSoup) -> CheckboxAnalysis:
        """Валидация найденных чекбоксов внутри формы."""
        if not checkboxes:
            return CheckboxAnalysis(
                exists=False,
                has_consent_keywords=False,
                is_prechecked=False
            )

        for cb in checkboxes:
            is_prechecked = cb.has_attr("checked") or cb.get("checked") == "checked"
            is_required = cb.has_attr("required")

            # Поиск текста рядом с чекбоксом (через <label> или родителя)
            associated_text = ""
            if cb.get("id"):
                lbl = form.find("label", attrs={"for": cb.get("id")})
                if lbl:
                    associated_text = lbl.get_text(" ", strip=True)

            if not associated_text:
                parent_label = cb.find_parent("label")
                if parent_label:
                    associated_text = parent_label.get_text(" ", strip=True)
                else:
                    # Берем текст родительского контейнера
                    parent = cb.parent
                    if parent:
                        associated_text = parent.get_text(" ", strip=True)

            text_lower = associated_text.lower()
            has_keywords = any(kw in text_lower for kw in cls.CONSENT_KEYWORDS)
            has_policy_link = bool(form.find("a", href=True) and ("политик" in form.get_text().lower() or "согласи" in form.get_text().lower()))

            if has_keywords or len(checkboxes) == 1:
                return CheckboxAnalysis(
                    exists=True,
                    is_required=is_required,
                    is_prechecked=is_prechecked,
                    associated_text=associated_text[:200] if associated_text else None,
                    has_consent_keywords=has_keywords,
                    has_policy_link=has_policy_link
                )

        return CheckboxAnalysis(
            exists=True,
            is_required=False,
            is_prechecked=False,
            has_consent_keywords=False
        )

    @classmethod
    async def _detect_cookie_banner(cls, page: Page, soup: BeautifulSoup) -> CookieBannerAudit:
        """Поиск плашек и модальных окон уведомления о Cookie."""
        page_text = soup.get_text().lower()
        cookie_re = re.compile(r"(cookie|куки|файлы\s*[\-–—]?\s*cookie)", re.IGNORECASE)
        has_cookie_mention = bool(cookie_re.search(page_text)) or any(kw in page_text for kw in cls.COOKIE_KEYWORDS)

        if not has_cookie_mention:
            return CookieBannerAudit(detected=False)

        def is_accept_element(tag) -> bool:
            t = tag.get_text(strip=True).lower()
            val = (tag.get("value") or "").lower()
            cls_str = " ".join(tag.get("class") or []).lower()
            tid = (tag.get("id") or "").lower()
            comb = f"{t} {val} {cls_str} {tid}"
            keywords = ["принять", "согласен", "понятно", "хорошо", "ok", "ок", "accept", "закрыть", "разрешить"]
            return any(w == t or t.startswith(w) or w in comb for w in keywords) or "hide_popup" in comb

        raw_text = None
        has_accept_btn = False
        banner_type = "fixed_notice"

        # 1. Поиск по характерным селекторам
        banner_elements = soup.find_all(
            lambda tag: tag.name in ("div", "section", "aside") and
            any(c in (tag.get("class") or []) or c in (tag.get("id") or "")
                for c in ["cookie", "cookies", "cookie-banner", "cookie-popup", "cookie-notice", "cookie-modal", "cookie-consent", "overlay"])
        )

        for b_el in banner_elements:
            b_text = b_el.get_text(" ", strip=True)
            if cookie_re.search(b_text) and 20 <= len(b_text) <= 800:
                raw_text = b_text[:250]
                banner_type = "modal_banner" if any(c in f"{b_el.get('id','')} {' '.join(b_el.get('class',[]))}".lower() for c in ["modal", "popup", "overlay"]) else "fixed_notice"
                for el in b_el.find_all(["button", "a", "div", "span", "input"]):
                    if is_accept_element(el):
                        has_accept_btn = True
                        break
                break

        # 2. Поиск по родительским контейнерам текстовых узлов
        if not raw_text:
            for node in soup.find_all(string=cookie_re):
                curr = node.parent
                depth = 0
                while curr and depth < 6:
                    ctext = curr.get_text(" ", strip=True)
                    if 25 <= len(ctext) <= 800 and cookie_re.search(ctext):
                        raw_text = ctext[:250]
                        banner_type = "modal_banner" if any(c in f"{curr.get('id','')} {' '.join(curr.get('class',[]))}".lower() for c in ["modal", "popup", "overlay"]) else "fixed_notice"
                        for el in curr.find_all(["button", "a", "div", "span", "input"]):
                            if is_accept_element(el):
                                has_accept_btn = True
                                break
                        break
                    curr = curr.parent
                    depth += 1
                if raw_text:
                    break

        if not has_accept_btn and raw_text:
            text_lower = raw_text.lower()
            has_accept_btn = any(btn in text_lower for btn in ["принять", "согласен", "понятно", "хорошо", "ok", "accept", "закрыть"])

        return CookieBannerAudit(
            detected=True,
            banner_type=banner_type,
            has_accept_button=has_accept_btn,
            has_policy_mention="политик" in (raw_text or "").lower() or "privacy" in (raw_text or "").lower(),
            raw_banner_text=raw_text,
            is_compliant=has_accept_btn
        )

    @classmethod
    def _extract_privacy_links(
        cls,
        soup: BeautifulSoup,
        current_url: str,
        found_urls: List[str],
        found_anchors: List[str]
    ):
        """Поиск ссылок на Политику конфиденциальности."""
        for a_tag in soup.find_all("a", href=True):
            href = a_tag["href"].strip()
            anchor_text = a_tag.get_text(strip=True)

            matches_anchor = any(pattern.search(anchor_text) for pattern in cls.POLICY_LINK_PATTERNS)
            matches_href = any(pattern.search(href) for pattern in cls.POLICY_LINK_PATTERNS)

            if matches_anchor or matches_href:
                full_url = urljoin(current_url, href)
                if full_url not in found_urls:
                    found_urls.append(full_url)
                    found_anchors.append(anchor_text or href)

    @classmethod
    async def _verify_policy_links(
        cls,
        urls: List[str],
        anchors: List[str]
    ) -> PrivacyPolicyAudit:
        """Проверка кода ответа и содержания документа Политики конфиденциальности."""
        if not urls:
            return PrivacyPolicyAudit(
                found=False,
                violations=["Ссылка на Политику конфиденциальности не найдена на сайте"]
            )

        is_accessible = False
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
            for url in urls[:3]:
                try:
                    resp = await client.get(url)
                    if resp.status_code == 200:
                        is_accessible = True
                        break
                except Exception:
                    continue

        return PrivacyPolicyAudit(
            found=True,
            policy_urls=urls,
            anchor_texts=anchors,
            is_accessible_200=is_accessible,
            is_direct_footer_link=True,
            violations=[] if is_accessible else ["Ссылка на Политику конфиденциальности возвращает ошибку"]
        )
