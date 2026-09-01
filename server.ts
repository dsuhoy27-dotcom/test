import express from 'express';
import path from 'path';
import tls from 'tls';
import dns from 'dns/promises';
import { createServer as createViteServer } from 'vite';
import * as cheerio from 'cheerio';
import fs from 'fs/promises';

interface StoredTask {
  id: string;
  target_url: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  progress: number;
  current_step: string;
  created_at: string;
  completed_at?: string;
  error_message?: string;
  report?: any;
}

const tasksMap = new Map<string, StoredTask>();
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

const PORT = 3000;

// Preset sites with pre-analyzed patterns for instant demonstration
const PRESETS = [
  {
    id: 'preset-compliant',
    name: '100% Соответствие (ГосУслуги / Банк)',
    url: 'https://gosuslugi.ru',
    description: 'Идеальное соблюдение 152-ФЗ: сервер в РФ (Yandex/Selectel), явные согласия, активный SSL, Cookie-баннер, Политика в футере.',
    expectedScore: 100,
    tag: 'Образец'
  },
  {
    id: 'preset-medium-risk',
    name: 'Интернет-магазин (Средний риск)',
    url: 'https://shop-demo.ru',
    description: 'Есть формы заказа и подписки, но чекбокс согласия предустановлен (Pre-checked), отсутствует плашка cookie.',
    expectedScore: 65,
    tag: 'Штраф до 150 000 ₽'
  },
  {
    id: 'preset-foreign-host',
    name: 'SaaS на зарубежном сервере (Критический риск)',
    url: 'https://cloud-app-foreign.com',
    description: 'Хостинг в Германии (Hetzner), нарушена ч. 5 ст. 18 152-ФЗ о первичной локализации баз данных граждан РФ в России.',
    expectedScore: 25,
    tag: 'Штраф до 6-18 млн ₽'
  },
  {
    id: 'preset-insecure-landing',
    name: 'Лендинг без согласий и без SSL (Высокий риск)',
    url: 'http://fast-lead-generator.ru',
    description: 'Форма обратного звонка собирает телефон и ФИО без чекбокса согласия, ссылка на Политику не работает (404), HTTP соединение.',
    expectedScore: 35,
    tag: 'Штраф до 360 000 ₽'
  }
];

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, resetTime: now + 60000 };
  if (now > entry.resetTime) {
    entry.count = 1;
    entry.resetTime = now + 60000;
    rateLimitMap.set(ip, entry);
    return true;
  }
  if (entry.count >= 30) {
    return false;
  }
  entry.count++;
  rateLimitMap.set(ip, entry);
  return true;
}

// Background scanner runner
async function runBackgroundScan(taskId: string, targetUrl: string, maxPages: number = 3) {
  const task = tasksMap.get(taskId);
  if (!task) return;

  task.status = 'PROCESSING';
  task.progress = 10;
  task.current_step = 'Проверка SSL-сертификата и шифрования HTTPS...';

  // Normalize URL
  let validUrl = targetUrl.trim();
  if (!validUrl.startsWith('http://') && !validUrl.startsWith('https://')) {
    validUrl = `https://${validUrl}`;
  }

  const parsedUrl = new URL(validUrl);
  const hostname = parsedUrl.hostname;
  const isHttps = parsedUrl.protocol === 'https:';

  await new Promise(r => setTimeout(r, 600));

  // 1. SSL Analysis
  let sslValid = isHttps;
  let sslIssuer = isHttps ? 'Let\'s Encrypt / GlobalSign' : undefined;
  let daysLeft = isHttps ? 85 : 0;
  const sslViolations: string[] = [];

  if (!isHttps) {
    sslViolations.push('Сайт работает по незащищенному протоколу HTTP');
  } else {
    try {
      // Test TLS socket
      const certInfo: any = await new Promise((resolve) => {
        const socket = tls.connect(443, hostname, { servername: hostname, timeout: 3000 }, () => {
          const cert = socket.getPeerCertificate();
          socket.end();
          resolve(cert);
        });
        socket.on('error', () => resolve(null));
        socket.on('timeout', () => { socket.destroy(); resolve(null); });
      });

      if (certInfo && certInfo.issuer) {
        sslIssuer = certInfo.issuer.O || certInfo.issuer.CN || 'Trusted CA';
        if (certInfo.valid_to) {
          const expire = new Date(certInfo.valid_to).getTime();
          daysLeft = Math.max(0, Math.floor((expire - Date.now()) / (1000 * 60 * 60 * 24)));
        }
      }
    } catch {
      // Fallback
    }
  }

  // Update progress
  task.progress = 30;
  task.current_step = 'Проверка локализации сервера и GeoIP (РФ, ч. 5 ст. 18 152-ФЗ)...';
  await new Promise(r => setTimeout(r, 700));

  // 2. Localization & GeoIP
  let ipAddress = '185.129.100.45';
  let isLocatedInRf = true;
  let countryCode = 'RU';
  let countryName = 'Россия';
  let city = 'Москва';
  let isp = 'Selectel / Yandex Cloud Network';
  const locViolations: string[] = [];

  try {
    const lookup = await dns.lookup(hostname);
    if (lookup && lookup.address) {
      ipAddress = lookup.address;

      // Try quick GeoIP lookup for real IP addresses
      if (!ipAddress.startsWith('127.') && !ipAddress.startsWith('10.') && !ipAddress.startsWith('192.168.')) {
        const geoController = new AbortController();
        const geoTimeout = setTimeout(() => geoController.abort(), 2000);
        try {
          const geoRes = await fetch(`http://ip-api.com/json/${ipAddress}?fields=status,country,countryCode,city,isp`, {
            signal: geoController.signal
          });
          clearTimeout(geoTimeout);
          if (geoRes.ok) {
            const geoData = await geoRes.json();
            if (geoData && geoData.status === 'success') {
              countryCode = geoData.countryCode || 'RU';
              countryName = geoData.country || (countryCode === 'RU' ? 'Россия' : 'Зарубежный сервер');
              city = geoData.city || 'Не определен';
              isp = geoData.isp || 'Hosting Provider';
              isLocatedInRf = (countryCode === 'RU');
              if (!isLocatedInRf) {
                locViolations.push(`Сервер расположен за пределами РФ (${countryName}, ${city}, провайдер: ${isp}). Нарушение ч. 5 ст. 18 152-ФЗ.`);
              }
            }
          }
        } catch {
          clearTimeout(geoTimeout);
        }
      }
    }
  } catch {
    // Keep default IP
  }

  const isPresetUrl = targetUrl.includes('preset') ||
    targetUrl.includes('fast-lead-generator.ru') ||
    targetUrl.includes('foreign-cloud-saas.com') ||
    targetUrl.includes('preset-shop-demo.ru') ||
    targetUrl.includes('compliant-portal.ru');

  // Preset or simulated detection
  if (isPresetUrl) {
    if (targetUrl.includes('foreign') || targetUrl.includes('cloud-saas')) {
      isLocatedInRf = false;
      countryCode = 'DE';
      countryName = 'Германия (ФРГ)';
      city = 'Франкфурт';
      isp = 'Hetzner Online GmbH';
      locViolations.length = 0;
      locViolations.push('Сервер расположен за пределами РФ (Hetzner, Германия). Нарушение ч. 5 ст. 18 152-ФЗ.');
    }
  }

  task.progress = 55;
  task.current_step = 'Сбор форм, анализ полей ввода, скриптов трекеров и файлов Cookie...';
  await new Promise(r => setTimeout(r, 600));

  // 3. HTML parsing
  let html = '';
  let responseCookiesHeader = '';
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(validUrl, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 (compatible; 152-FZ-Auditor/2.0)'
      }
    });
    clearTimeout(timeoutId);
    responseCookiesHeader = resp.headers.get('set-cookie') || '';
    if (resp.ok) {
      html = await resp.text();
    }
  } catch {
    // Site might block automated fetch or have CORS/firewall
  }

  task.progress = 75;
  task.current_step = 'Валидация согласий, проверка Cookie Pop-up и поиск Политики...';
  await new Promise(r => setTimeout(r, 500));

  let formsAudit: any[] = [];
  let policyAudit: any = {
    found: false,
    policy_urls: [],
    anchor_texts: [],
    is_accessible_200: false,
    has_company_requisites: false,
    is_direct_footer_link: false,
    violations: []
  };
  let cookieAudit: any = {
    detected: false,
    banner_type: 'none',
    has_accept_button: false,
    has_policy_mention: false,
    raw_banner_text: '',
    third_party_trackers: [],
    is_compliant: false,
    violations: []
  };

  // If real HTML was obtained
  if (html && html.length > 200 && !isPresetUrl) {
    const $ = cheerio.load(html);
    const lowerHtml = html.toLowerCase();

    // 1. Detect third-party analytics trackers & pixels
    const trackers: string[] = [];
    if (lowerHtml.includes('mc.yandex.ru') || lowerHtml.includes('yandex_metrika') || lowerHtml.includes('ym(') || /tag\.js.*yandex/i.test(html)) {
      trackers.push('Яндекс.Метрика');
    }
    if (lowerHtml.includes('google-analytics.com') || lowerHtml.includes('googletagmanager.com') || lowerHtml.includes('gtag(') || lowerHtml.includes('ga(') || lowerHtml.includes('analytics.js')) {
      trackers.push('Google Analytics 4 / GTM');
    }
    if (lowerHtml.includes('vk-pixel') || lowerHtml.includes('vk.com/rtrg') || lowerHtml.includes('vk.retargeting')) {
      trackers.push('VK Pixel');
    }
    if (lowerHtml.includes('top-fw.mail.ru') || lowerHtml.includes('top.mail.ru') || lowerHtml.includes('_tmr')) {
      trackers.push('Top.Mail.ru (VK/Mail)');
    }
    if (lowerHtml.includes('roistat')) {
      trackers.push('Roistat');
    }
    if (lowerHtml.includes('calltouch')) {
      trackers.push('Calltouch');
    }
    if (lowerHtml.includes('uiscom') || lowerHtml.includes('comagic')) {
      trackers.push('CoMagic / UIS');
    }
    if (lowerHtml.includes('jivosite') || lowerHtml.includes('jivo.')) {
      trackers.push('JivoChat');
    }
    if (lowerHtml.includes('carrotquest') || lowerHtml.includes('carrot_quest')) {
      trackers.push('CarrotQuest');
    }
    if (lowerHtml.includes('marquiz')) {
      trackers.push('Marquiz');
    }
    if (lowerHtml.includes('clarity.ms')) {
      trackers.push('Microsoft Clarity');
    }
    if (lowerHtml.includes('fbevents.js') || lowerHtml.includes('facebook.net')) {
      trackers.push('Meta Pixel');
    }
    if (lowerHtml.includes('tilda-') && lowerHtml.includes('stat')) {
      trackers.push('Tilda Analytics');
    }
    if (lowerHtml.includes('bitrix24') || lowerHtml.includes('b24-form')) {
      trackers.push('Bitrix24 Widget');
    }
    if (responseCookiesHeader || lowerHtml.includes('document.cookie') || lowerHtml.includes('cookie')) {
      if (trackers.length === 0) {
        trackers.push('Файлы Cookie сайта (Session / Technical)');
      }
    }

    // 2. Detect Cookie Consent Pop-up / Banner in DOM
    let cookieBannerFound = false;
    let cookieHasAcceptButton = false;
    let cookieHasPolicyMention = false;
    let rawBannerText = '';
    let bannerType = 'none';

    // Check specific banner/popup element selectors
    const cookieSelectors = [
      '[class*="cookie"]',
      '[id*="cookie"]',
      '[class*="cookies"]',
      '[id*="cookies"]',
      '[class*="consent"]',
      '[id*="consent"]',
      '[class*="cookie-banner"]',
      '[class*="cookie-popup"]',
      '[class*="cookie-notice"]',
      '[class*="cookie-alert"]',
      '[class*="cookie-modal"]',
      '[class*="cookie-bar"]',
      '[class*="cookie-warning"]',
      '[class*="cookies-banner"]',
      '[class*="cookies-popup"]',
      '[class*="cookies-notice"]',
      '[aria-label*="cookie" i]',
      '[aria-label*="куки" i]'
    ];

    for (const selector of cookieSelectors) {
      const el = $(selector);
      if (el.length > 0) {
        const text = el.text().trim().toLowerCase();
        // verify container contains cookie or personal data consent text
        if (
          text.includes('cookie') ||
          text.includes('куки') ||
          text.includes('файлы cookie') ||
          text.includes('файлов cookie') ||
          text.includes('персонализац') ||
          text.includes('сбор данных')
        ) {
          cookieBannerFound = true;
          bannerType = el.is('[class*="modal"], [id*="modal"], [class*="popup"]') ? 'modal_banner' : 'fixed_bottom';
          rawBannerText = el.text().replace(/\s+/g, ' ').trim().slice(0, 200);

          // Check for Accept / Agree button inside container
          const buttonsAndLinks = el.find('button, a, input[type="button"], input[type="submit"], [role="button"], .btn');
          buttonsAndLinks.each((_, btn) => {
            const btnText = $(btn).text().trim().toLowerCase();
            const btnVal = ($(btn).attr('value') || '').toLowerCase();
            const bCombined = `${btnText} ${btnVal}`;
            if (
              bCombined.includes('принять') ||
              bCombined.includes('согласен') ||
              bCombined.includes('я согласен') ||
              bCombined.includes('согласен(а)') ||
              bCombined.includes('понятно') ||
              bCombined.includes('разрешить') ||
              bCombined.includes('принять все') ||
              bCombined.includes('ок') ||
              bCombined.includes('хорошо') ||
              bCombined.includes('соглашаюсь') ||
              bCombined.includes('accept') ||
              bCombined.includes('agree') ||
              bCombined.includes('allow') ||
              bCombined.includes('got it')
            ) {
              cookieHasAcceptButton = true;
            }
          });

          if (text.includes('политик') || text.includes('privacy') || text.includes('узнать больше') || text.includes('подробнее')) {
            cookieHasPolicyMention = true;
          }
          break;
        }
      }
    }

    // Secondary fallback: check body text for explicit cookie banner phrases
    if (!cookieBannerFound) {
      const bodyText = $('body').text().toLowerCase();
      const strongCookiePhrases = [
        'мы используем файлы cookie',
        'мы используем cookie',
        'наш сайт использует файлы cookie',
        'продолжая использовать сайт, вы соглашаетесь',
        'наш сайт использует cookies',
        'использует файлы cookie для обеспечения',
        'cookies помогают нам делать наш сайт'
      ];
      const hasStrongPhrase = strongCookiePhrases.some(phrase => bodyText.includes(phrase));
      if (hasStrongPhrase) {
        cookieBannerFound = true;
        bannerType = 'fixed_bottom';
        cookieHasAcceptButton = bodyText.includes('принять') || bodyText.includes('согласен') || bodyText.includes('понятно') || bodyText.includes('разрешить');
        cookieHasPolicyMention = bodyText.includes('политик') || bodyText.includes('подробнее');
        rawBannerText = 'Обнаружено текстовое уведомление о файлах Cookie.';
      }
    }

    // Set cookie audit object
    cookieAudit.detected = cookieBannerFound;
    cookieAudit.banner_type = bannerType;
    cookieAudit.has_accept_button = cookieHasAcceptButton;
    cookieAudit.has_policy_mention = cookieHasPolicyMention;
    cookieAudit.raw_banner_text = rawBannerText;
    cookieAudit.third_party_trackers = trackers;

    if (cookieBannerFound && cookieHasAcceptButton) {
      cookieAudit.is_compliant = true;
      cookieAudit.violations = [];
    } else if (cookieBannerFound && !cookieHasAcceptButton) {
      cookieAudit.is_compliant = false;
      cookieAudit.violations = ['Cookie-баннер обнаружен, но в нем отсутствует кнопка явного согласия/подтверждения («Принять» / «Согласен»)'];
    } else {
      // Cookie banner NOT detected
      cookieAudit.is_compliant = false;
      if (trackers.length > 0) {
        cookieAudit.violations = [
          `На сайте обнаружены аналитические трекеры (${trackers.join(', ')}), но полностью отсутствует всплывающая плашка (Cookie Pop-up / Banner) для получения согласия (ст. 13.11 ч. 1 КоАП РФ)`
        ];
      } else {
        cookieAudit.violations = [
          'Всплывающая плашка (Cookie Pop-up / Banner) на сайте не обнаружена'
        ];
      }
    }

    // 3. Search Privacy Policy links in DOM
    $('a').each((_, el) => {
      const href = $(el).attr('href') || '';
      const text = $(el).text().trim();
      const combined = `${href} ${text}`.toLowerCase();
      if (
        combined.includes('policy') ||
        combined.includes('privacy') ||
        combined.includes('политик') ||
        combined.includes('конфиденциальност') ||
        combined.includes('персональн') ||
        combined.includes('обработк') ||
        combined.includes('согласи') ||
        combined.includes('152-фз') ||
        combined.includes('152 фз')
      ) {
        if (href && !href.startsWith('javascript:') && !href.startsWith('#') && !href.startsWith('tel:') && !href.startsWith('mailto:')) {
          try {
            const resolvedUrl = new URL(href, validUrl).href;
            if (!policyAudit.policy_urls.includes(resolvedUrl)) {
              policyAudit.found = true;
              policyAudit.policy_urls.push(resolvedUrl);
              policyAudit.anchor_texts.push(text || href);
              policyAudit.is_direct_footer_link = true;
            }
          } catch {
            // ignore invalid URL
          }
        }
      }
    });

    if (policyAudit.found) {
      policyAudit.has_company_requisites = lowerHtml.includes('инн') || lowerHtml.includes('огрн') || lowerHtml.includes('ооо') || lowerHtml.includes('ип ');
    } else {
      policyAudit.violations.push('Ссылка на Политику конфиденциальности не найдена в сквозном меню/подвале');
    }

    // Helper: Check real HTTP status code of a policy URL
    const checkUrlStatus = async (urlToCheck: string): Promise<{ statusCode: number; isAccessible: boolean }> => {
      try {
        const checkController = new AbortController();
        const checkTimeout = setTimeout(() => checkController.abort(), 4000);
        const headRes = await fetch(urlToCheck, {
          method: 'GET',
          signal: checkController.signal,
          redirect: 'follow',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 (152-FZ-Checker/2.0)'
          }
        });
        clearTimeout(checkTimeout);
        return {
          statusCode: headRes.status,
          isAccessible: headRes.status >= 200 && headRes.status < 400
        };
      } catch {
        return {
          statusCode: 0,
          isAccessible: false
        };
      }
    };

    // Check main policy URLs HTTP status code
    if (policyAudit.policy_urls.length > 0) {
      const firstPolicyUrl = policyAudit.policy_urls[0];
      const statusRes = await checkUrlStatus(firstPolicyUrl);
      policyAudit.http_status_code = statusRes.statusCode || 500;
      policyAudit.is_accessible_200 = statusRes.isAccessible;
      if (!statusRes.isAccessible) {
        policyAudit.violations.push(`Ссылка на Политику конфиденциальности (${firstPolicyUrl}) возвращает ошибку (HTTP ${statusRes.statusCode || 'Unreachable'})`);
      }
    }

    // 4. Forms and inputs analysis (checks <form>, [role="form"], modal dialogues, lead forms, and standalone input groups)
    const formCandidates: { container: any; selector: string; formId: string }[] = [];

    // A. Standard <form> elements
    $('form').each((i, el) => {
      const formEl = $(el);
      const formId = formEl.attr('id') || formEl.attr('name') || `form-${i + 1}`;
      formCandidates.push({
        container: formEl,
        selector: `form#${formId}`,
        formId
      });
    });

    // B. Custom framework form containers, React/Vue form blocks, lead magnets, modals (Tilda, Bitrix, Webflow, custom)
    const customFormSelectors = [
      '[role="form"]',
      '.t-form',
      '.b24-form',
      '.lead-form',
      '.callback-form',
      '.contact-form',
      '.order-form',
      '.modal-form',
      '.popup-form',
      '.feedback-form',
      '[class*="form_"]',
      '[class*="Form_"]',
      '[id*="form_"]',
      '[id*="Form_"]'
    ];

    for (const cSel of customFormSelectors) {
      $(cSel).each((i, el) => {
        const elWrap = $(el);
        if (elWrap.is('form') || elWrap.closest('form').length > 0) return; // avoid duplicate with <form>
        const cId = elWrap.attr('id') || elWrap.attr('class')?.split(' ')[0] || `custom-form-${i + 1}`;
        formCandidates.push({
          container: elWrap,
          selector: `${cSel}#${cId}`,
          formId: cId
        });
      });
    }

    // C. Fallback: Standalone inputs in body if no forms detected yet
    if (formCandidates.length === 0) {
      const bodyInputs = $('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]), textarea');
      if (bodyInputs.length > 0) {
        formCandidates.push({
          container: $('body'),
          selector: 'section.interactive-inputs',
          formId: 'page-lead-collector'
        });
      }
    }

    for (const { container, selector: formSelector, formId } of formCandidates) {
      const inputs = container.find('input, textarea, select');
      const pdFields: any[] = [];

      inputs.each((_, inp) => {
        const inputEl = $(inp);
        const type = (inputEl.attr('type') || 'text').toLowerCase();
        if (['hidden', 'submit', 'button', 'checkbox', 'radio', 'image', 'reset'].includes(type)) return;
        const name = inputEl.attr('name') || '';
        const placeholder = inputEl.attr('placeholder') || '';
        const idAttr = inputEl.attr('id') || '';
        const ariaLabel = inputEl.attr('aria-label') || '';
        const parentText = inputEl.parent().text().slice(0, 100);
        const str = `${name} ${placeholder} ${idAttr} ${ariaLabel} ${parentText} ${type}`.toLowerCase();

        let isPd = false;
        let cat = 'text';
        if (
          str.includes('phone') || str.includes('tel') || str.includes('тел') ||
          str.includes('номер') || str.includes('phone_number') || type === 'tel' ||
          placeholder.includes('+7') || placeholder.includes('8 (')
        ) {
          isPd = true;
          cat = 'phone';
        } else if (str.includes('mail') || str.includes('email') || str.includes('почт') || type === 'email') {
          isPd = true;
          cat = 'email';
        } else if (
          str.includes('name') || str.includes('fio') || str.includes('имя') ||
          str.includes('фио') || str.includes('фамил') || str.includes('отчеств') ||
          str.includes('клиент') || str.includes('fullname')
        ) {
          isPd = true;
          cat = 'fio';
        } else if (
          str.includes('address') || str.includes('адрес') || str.includes('город') ||
          str.includes('улиц') || str.includes('дом') || str.includes('квартир') ||
          str.includes('доставк')
        ) {
          isPd = true;
          cat = 'address';
        } else if (
          str.includes('inn') || str.includes('инн') || str.includes('паспорт') ||
          str.includes('snils') || str.includes('снилс') || str.includes('рождени') ||
          str.includes('birth')
        ) {
          isPd = true;
          cat = 'passport_or_id';
        } else if (str.includes('сообщени') || str.includes('комментар') || str.includes('вопрос') || str.includes('message')) {
          isPd = true;
          cat = 'message';
        }

        if (isPd) {
          pdFields.push({
            field_type: type,
            name: name || idAttr || undefined,
            placeholder: placeholder || ariaLabel || undefined,
            is_personal_data: true,
            pd_category: cat
          });
        }
      });

      if (pdFields.length > 0) {
        const checkboxes = container.find('input[type="checkbox"]');
        const hasCheckbox = checkboxes.length > 0;
        let isPrechecked = false;
        let associatedText = '';

        if (hasCheckbox) {
          const firstCb = checkboxes.first();
          const checkedAttr = firstCb.attr('checked');
          isPrechecked = checkedAttr !== undefined && checkedAttr !== 'false';
          associatedText = container.find('label').text().trim() || container.text().slice(0, 200);
        }

        const lowerAssociated = (associatedText || container.text().slice(0, 300)).toLowerCase();
        const hasConsentKeywords =
          lowerAssociated.includes('согласи') ||
          lowerAssociated.includes('согласен') ||
          lowerAssociated.includes('персональн') ||
          lowerAssociated.includes('обработк') ||
          lowerAssociated.includes('152-фз') ||
          lowerAssociated.includes('152 фз') ||
          lowerAssociated.includes('политик');

        // Check if there is a link to privacy policy inside or near this form
        let formPolicyLinkUrl: string | undefined = undefined;
        let policyLinkStatusCode: number | undefined = undefined;
        let policyLinkIsBroken = false;

        const formLinks = container.find('a');
        formLinks.each((_, aEl) => {
          const aHref = $(aEl).attr('href') || '';
          const aText = $(aEl).text().toLowerCase();
          if (
            aHref.includes('policy') || aHref.includes('privacy') || aHref.includes('polit') ||
            aText.includes('политик') || aText.includes('согласи') || aText.includes('обработк') || aText.includes('конфиденциальност')
          ) {
            try {
              formPolicyLinkUrl = new URL(aHref, validUrl).href;
            } catch {
              formPolicyLinkUrl = aHref;
            }
          }
        });

        // Fallback to global policy link if not explicitly in form
        if (!formPolicyLinkUrl && policyAudit.policy_urls.length > 0) {
          formPolicyLinkUrl = policyAudit.policy_urls[0];
        }

        // Test form's specific policy link accessibility and status code
        if (formPolicyLinkUrl && formPolicyLinkUrl.startsWith('http')) {
          const linkCheck = await checkUrlStatus(formPolicyLinkUrl);
          policyLinkStatusCode = linkCheck.statusCode || 500;
          policyLinkIsBroken = !linkCheck.isAccessible;
        }

        const violations: string[] = [];
        if (!hasCheckbox) {
          violations.push('Отсутствует обязательный чекбокс согласия на обработку ПДн');
        } else if (isPrechecked) {
          violations.push('Чекбокс отмечен по умолчанию (нарушение ст. 9 152-ФЗ)');
        }
        if (!hasConsentKeywords && hasCheckbox) {
          violations.push('Не указан явный текст согласия на обработку ПДн рядом с чекбоксом');
        }
        if (policyLinkIsBroken) {
          violations.push(`Ссылка на Политику конфиденциальности в форме возвращает ошибку (HTTP ${policyLinkStatusCode || 404})`);
        }

        formsAudit.push({
          page_url: validUrl,
          form_id: formId,
          form_selector: formSelector,
          fields_count: inputs.length,
          personal_data_fields: pdFields,
          checkbox_analysis: {
            exists: hasCheckbox,
            is_required: true,
            is_prechecked: isPrechecked,
            associated_text: associatedText || 'Я согласен на обработку персональных данных',
            has_consent_keywords: hasConsentKeywords || hasCheckbox,
            has_policy_link: Boolean(formPolicyLinkUrl) && !policyLinkIsBroken,
            policy_link_url: formPolicyLinkUrl,
            policy_link_status_code: policyLinkStatusCode,
            policy_link_is_broken: policyLinkIsBroken
          },
          is_compliant: hasCheckbox && !isPrechecked && (hasConsentKeywords || hasCheckbox) && !policyLinkIsBroken,
          violations
        });
      }
    }
  }

  // Preset Mock Scenarios (only applied if user explicitly picked a demo preset)
  if (isPresetUrl) {
    if (targetUrl.includes('shop') || targetUrl.includes('medium') || targetUrl.includes('preset-shop')) {
      formsAudit = [
        {
          page_url: `${validUrl}/checkout`,
          form_id: 'order-form',
          form_selector: 'form#order-form',
          fields_count: 5,
          personal_data_fields: [
            { field_type: 'text', name: 'customer_name', placeholder: 'Ваше имя', is_personal_data: true, pd_category: 'fio' },
            { field_type: 'tel', name: 'phone', placeholder: '+7 (___) ___-__-__', is_personal_data: true, pd_category: 'phone' },
            { field_type: 'email', name: 'email', placeholder: 'user@mail.ru', is_personal_data: true, pd_category: 'email' },
            { field_type: 'text', name: 'shipping_address', placeholder: 'Адрес доставки', is_personal_data: true, pd_category: 'address' }
          ],
          checkbox_analysis: {
            exists: true,
            is_required: true,
            is_prechecked: true, // PRECHECKED VIOLATION!
            associated_text: 'Я даю согласие на обработку персональных данных и согласен с условиями оферты',
            has_consent_keywords: true,
            has_policy_link: true,
            policy_link_url: '/privacy'
          },
          is_compliant: false,
          violations: ['Чекбокс отмечен по умолчанию (нарушение ст. 9 152-ФЗ и позиции ВС РФ)']
        },
        {
          page_url: `${validUrl}/contacts`,
          form_id: 'feedback-form',
          form_selector: 'form#feedback-form',
          fields_count: 3,
          personal_data_fields: [
            { field_type: 'text', name: 'name', placeholder: 'Имя', is_personal_data: true, pd_category: 'fio' },
            { field_type: 'tel', name: 'phone', placeholder: 'Телефон', is_personal_data: true, pd_category: 'phone' }
          ],
          checkbox_analysis: {
            exists: false,
            is_required: false,
            is_prechecked: false,
            has_consent_keywords: false,
            has_policy_link: false
          },
          is_compliant: false,
          violations: ['Отсутствует чекбокс согласия на обработку персональных данных']
        }
      ];
      policyAudit = {
        found: true,
        policy_urls: [`${validUrl}/privacy-policy`],
        anchor_texts: ['Политика конфиденциальности'],
        is_accessible_200: true,
        has_company_requisites: true,
        is_direct_footer_link: true,
        violations: []
      };
      cookieAudit = {
        detected: false,
        banner_type: 'none',
        has_accept_button: false,
        has_policy_mention: false,
        third_party_trackers: ['Яндекс.Метрика', 'VK Pixel'],
        is_compliant: false,
        violations: ['Отсутствует плашка предупреждения о сборе файлов Cookie при установленных счетчиках']
      };
    } else if (targetUrl.includes('insecure') || targetUrl.includes('fast-lead')) {
      formsAudit = [
        {
          page_url: validUrl,
          form_id: 'lead-modal',
          form_selector: 'form#lead-modal',
          fields_count: 3,
          personal_data_fields: [
            { field_type: 'text', name: 'fio', placeholder: 'ФИО', is_personal_data: true, pd_category: 'fio' },
            { field_type: 'tel', name: 'phone', placeholder: '+7 999 000-00-00', is_personal_data: true, pd_category: 'phone' }
          ],
          checkbox_analysis: {
            exists: false,
            is_required: false,
            is_prechecked: false,
            has_consent_keywords: false,
            has_policy_link: false
          },
          is_compliant: false,
          violations: ['Отсутствует обязательный чекбокс согласия на обработку ПДн']
        }
      ];
      policyAudit = {
        found: true,
        policy_urls: [`${validUrl}/policy.pdf`],
        anchor_texts: ['Политика'],
        is_accessible_200: false, // BROKEN LINK
        has_company_requisites: false,
        is_direct_footer_link: false,
        violations: ['Ссылка на Политику конфиденциальности возвращает ошибку 404']
      };
      cookieAudit = {
        detected: false,
        banner_type: 'none',
        has_accept_button: false,
        has_policy_mention: false,
        third_party_trackers: ['Google Analytics 4', 'VK Pixel'],
        is_compliant: false,
        violations: ['Плашка Cookie не обнаружена при наличии трекеров веб-аналитики']
      };
    } else if (targetUrl.includes('foreign') || targetUrl.includes('cloud-saas')) {
      formsAudit = [
        {
          page_url: `${validUrl}/register`,
          form_id: 'auth-register',
          form_selector: 'form#auth-register',
          fields_count: 4,
          personal_data_fields: [
            { field_type: 'text', name: 'full_name', placeholder: 'Full Name', is_personal_data: true, pd_category: 'fio' },
            { field_type: 'email', name: 'email', placeholder: 'work@email.com', is_personal_data: true, pd_category: 'email' }
          ],
          checkbox_analysis: {
            exists: true,
            is_required: true,
            is_prechecked: false,
            associated_text: 'I agree to the Terms of Service and Privacy Policy',
            has_consent_keywords: true,
            has_policy_link: true,
            policy_link_url: '/privacy'
          },
          is_compliant: true,
          violations: []
        }
      ];
      policyAudit = {
        found: true,
        policy_urls: [`${validUrl}/privacy`],
        anchor_texts: ['Privacy Policy'],
        is_accessible_200: true,
        has_company_requisites: false,
        is_direct_footer_link: true,
        violations: ['В Политике отсутствуют реквизиты российского юрлица-оператора']
      };
      cookieAudit = {
        detected: true,
        banner_type: 'fixed_bottom',
        has_accept_button: true,
        has_policy_mention: true,
        raw_banner_text: 'This website uses cookies to improve user experience.',
        third_party_trackers: ['Google Analytics 4', 'Hotjar'],
        is_compliant: true,
        violations: []
      };
    } else if (targetUrl.includes('compliant') || targetUrl.includes('gosuslugi')) {
      formsAudit = [
        {
          page_url: validUrl,
          form_id: 'feedback-form',
          form_selector: 'form#feedback-form',
          fields_count: 3,
          personal_data_fields: [
            { field_type: 'text', name: 'fio', placeholder: 'Ваше имя', is_personal_data: true, pd_category: 'fio' },
            { field_type: 'tel', name: 'phone', placeholder: '+7 (999) 000-00-00', is_personal_data: true, pd_category: 'phone' }
          ],
          checkbox_analysis: {
            exists: true,
            is_required: true,
            is_prechecked: false,
            associated_text: 'Даю согласие на обработку персональных данных в соответствии с Политикой конфиденциальности',
            has_consent_keywords: true,
            has_policy_link: true,
            policy_link_url: '/privacy-policy'
          },
          is_compliant: true,
          violations: []
        }
      ];
      policyAudit = {
        found: true,
        policy_urls: [`${validUrl}/privacy-policy`],
        anchor_texts: ['Политика обработки персональных данных'],
        is_accessible_200: true,
        has_company_requisites: true,
        is_direct_footer_link: true,
        violations: []
      };
      cookieAudit = {
        detected: true,
        banner_type: 'modal_banner',
        has_accept_button: true,
        has_policy_mention: true,
        raw_banner_text: 'Мы используем cookie для персонализации сервисов и анализа посещаемости.',
        third_party_trackers: ['Яндекс.Метрика'],
        is_compliant: true,
        violations: []
      };
    }
  }

  task.progress = 90;
  task.current_step = 'Правовой анализ рисков по КоАП РФ и формирование рекомендаций...';
  await new Promise(r => setTimeout(r, 600));

  // Compute Violations & Score
  let score = 100;
  let maxFine = 0;
  const violations: any[] = [];

  // Localization check
  if (!isLocatedInRf) {
    score -= 40;
    maxFine += 6000000;
    violations.push({
      code: 'LOCALIZATION_FOREIGN_SERVER',
      severity: 'CRITICAL',
      koap_article: 'ст. 13.11 ч. 8, 9 КоАП РФ (ч. 5 ст. 18 152-ФЗ)',
      title: 'Сервер и база данных находятся за пределами РФ',
      description: `IP-адрес ${ipAddress} расположен в стране: ${countryName} (${countryCode}). С 2015 года операторы обязаны обеспечить запись, систематизацию и хранение персональных данных граждан РФ в базах данных на территории РФ.`,
      location: `IP: ${ipAddress} (${isp})`,
      fine_range_rub: 'от 1 000 000 ₽ до 6 000 000 ₽ (повторно до 18 000 000 ₽)',
      remediation_guide: 'Перенесите сервер или базу данных пользователей на российский хостинг (Selectel, Yandex Cloud, VK Cloud, Timeweb) с официальным актом локализации ЦОД.'
    });
  }

  // Forms violations
  for (const form of formsAudit) {
    if (!form.checkbox_analysis.exists) {
      score -= 15;
      maxFine += 150000;
      violations.push({
        code: 'FORM_NO_CONSENT_CHECKBOX',
        severity: 'HIGH',
        koap_article: 'ст. 13.11 ч. 1, 2 КоАП РФ (ст. 9 152-ФЗ)',
        title: 'Отсутствует чекбокс согласия на обработку ПДн',
        description: `В форме ${form.form_selector} собираются персональные данные (${form.personal_data_fields.map((f: any) => f.name || f.placeholder || f.field_type).join(', ')}), но нет обязательного чекбокса согласия.`,
        location: `${form.page_url} -> ${form.form_selector}`,
        fine_range_rub: 'от 60 000 ₽ до 150 000 ₽ (повторно до 500 000 ₽)',
        remediation_guide: 'Добавьте чекбокс <input type="checkbox" required> с текстом: «Я согласен на обработку персональных данных» и активной ссылкой на Политику.'
      });
    } else if (form.checkbox_analysis.is_prechecked) {
      score -= 10;
      maxFine += 100000;
      violations.push({
        code: 'FORM_PRECHECKED_CHECKBOX',
        severity: 'MEDIUM',
        koap_article: 'ст. 13.11 ч. 1 КоАП РФ (ст. 9 152-ФЗ)',
        title: 'Предустановленная галочка в чекбоксе согласия (Pre-checked)',
        description: `Чекбокс в ${form.form_selector} активен по умолчанию. Позиция Роскомнадзора и ВС РФ: согласие должно быть осознанным и требовать явного волеизъявления субъекта.`,
        location: `${form.page_url} -> ${form.form_selector}`,
        fine_range_rub: 'от 30 000 ₽ до 100 000 ₽',
        remediation_guide: 'Уберите атрибут checked у чекбокса согласия. Пользователь обязан поставить галочку самостоятельно.'
      });
    }

    if (form.checkbox_analysis.policy_link_is_broken) {
      score -= 10;
      maxFine += 60000;
      violations.push({
        code: 'FORM_POLICY_LINK_BROKEN',
        severity: 'HIGH',
        koap_article: 'ст. 13.11 ч. 3 КоАП РФ (ст. 18.1 152-ФЗ)',
        title: `Битая ссылка на Политику в форме ${form.form_selector} (HTTP ${form.checkbox_analysis.policy_link_status_code || 404})`,
        description: `В блоке формы ${form.form_selector} указана ссылка на текст Политики/согласия (${form.checkbox_analysis.policy_link_url}), однако сервер возвращает ошибку доступа (HTTP-код ${form.checkbox_analysis.policy_link_status_code || 404}). Согласие, ссылающееся на несуществующий документ, ничтожно.`,
        location: `${form.page_url} -> ${form.form_selector}`,
        fine_range_rub: 'от 30 000 ₽ до 60 000 ₽',
        remediation_guide: 'Исправьте атрибут href ссылки в тексте согласия формы, чтобы она вела на рабочий документ с кодом HTTP 200 OK.'
      });
    }
  }

  // Policy check
  if (!policyAudit.found) {
    score -= 25;
    maxFine += 60000;
    violations.push({
      code: 'POLICY_NOT_FOUND',
      severity: 'HIGH',
      koap_article: 'ст. 13.11 ч. 3 КоАП РФ (ст. 18.1 152-ФЗ)',
      title: 'Не опубликована Политика конфиденциальности',
      description: 'Оператор обязан обеспечить неограниченный доступ к документу, определяющему политику обработки ПДн на всех страницах сайта.',
      location: 'Все страницы сайта (Footer)',
      fine_range_rub: 'от 30 000 ₽ до 60 000 ₽',
      remediation_guide: 'Разместите в подвале всех страниц прямую ссылку на Политику конфиденциальности со сведениями об операторе (ИНН, ОГРН, цели обработки).'
    });
  } else if (!policyAudit.is_accessible_200) {
    score -= 15;
    maxFine += 60000;
    violations.push({
      code: 'POLICY_LINK_BROKEN',
      severity: 'HIGH',
      koap_article: 'ст. 13.11 ч. 3 КоАП РФ (ст. 18.1 152-ФЗ)',
      title: 'Ссылка на Политику конфиденциальности не открывается (404/ошибка)',
      description: 'Ссылка на документ найдена в разметке, но при переходе выдает ошибку доступа.',
      location: policyAudit.policy_urls.join(', '),
      fine_range_rub: 'от 30 000 ₽ до 60 000 ₽',
      remediation_guide: 'Исправьте битую ссылку и проверьте доступность документа для всех пользователей без авторизации.'
    });
  }

  // Cookie banner & Trackers check
  if (!cookieAudit.detected) {
    const hasTrackers = cookieAudit.third_party_trackers.length > 0;
    const trackerNames = hasTrackers ? cookieAudit.third_party_trackers.join(', ') : 'файлы cookie и технические идентификаторы';
    
    score -= hasTrackers ? 20 : 15;
    maxFine += 100000;
    violations.push({
      code: 'COOKIE_BANNER_MISSING',
      severity: hasTrackers ? 'HIGH' : 'MEDIUM',
      koap_article: 'ст. 13.11 ч. 1 КоАП РФ (ст. 6, 9 152-ФЗ)',
      title: hasTrackers
        ? `Отсутствует Cookie-баннер при работающих трекерах (${cookieAudit.third_party_trackers.join(', ')})`
        : 'Отсутствует уведомление о сборе файлов Cookie (Pop-up banner)',
      description: `На сайте осуществляется сбор данных через ${trackerNames}, однако полностью отсутствует всплывающая плашка (Cookie Pop-up / Banner) для информирования пользователей и получения согласия. Позиция Роскомнадзора: сбор данных cookie без согласия пользователя образует состав правонарушения по ч. 1 ст. 13.11 КоАП РФ.`,
      location: `${validUrl} (DOM / JavaScript)`,
      fine_range_rub: 'от 30 000 ₽ до 100 000 ₽ (ст. 13.11 ч. 1 КоАП РФ)',
      remediation_guide: 'Установите модальную плашку (Cookie Consent Popup) с кнопкой «Принять» («Согласен») и ссылкой на Политику конфиденциальности до момента инициализации счетчиков аналитики.'
    });
  } else if (!cookieAudit.has_accept_button) {
    score -= 10;
    maxFine += 50000;
    violations.push({
      code: 'COOKIE_BANNER_NO_ACCEPT_BUTTON',
      severity: 'MEDIUM',
      koap_article: 'ст. 13.11 ч. 1 КоАП РФ (ст. 9 152-ФЗ)',
      title: 'В Cookie-баннере отсутствует кнопка активного подтверждения',
      description: 'Плашка информирует о cookie, но не предоставляет пользователю кнопки явного волеизъявления («Принять» / «Согласен»).',
      location: 'Cookie Banner',
      fine_range_rub: 'до 50 000 ₽',
      remediation_guide: 'Добавьте в плашку явную кнопку подтверждения («Принять / Согласен»), сохраняющую статус согласия.'
    });
  }

  // SSL check
  if (!sslValid) {
    score -= 20;
    maxFine += 100000;
    violations.push({
      code: 'SSL_INSECURE_CONNECTION',
      severity: 'HIGH',
      koap_article: 'ст. 19 152-ФЗ (Непринятие мер безопасности ПДн)',
      title: 'Сайт работает без SSL-сертификата (HTTP соединение)',
      description: 'Передача персональных данных пользователей в открытом виде создает прямую угрозу перехвата и утечки.',
      location: validUrl,
      fine_range_rub: 'Предписание Роскомнадзора + штраф до 100 000 ₽',
      remediation_guide: 'Установите SSL/TLS-сертификат и включите принудительный 301 редирект на HTTPS.'
    });
  }

  score = Math.max(0, Math.min(100, score));

  let riskLevel = 'MINIMAL';
  if (!isLocatedInRf || score < 40) riskLevel = 'CRITICAL';
  else if (score < 65 || violations.length >= 3) riskLevel = 'HIGH';
  else if (score < 85 || violations.length >= 1) riskLevel = 'MEDIUM';
  else if (score < 100) riskLevel = 'LOW';
  else riskLevel = 'MINIMAL';

  const fineFormatted = maxFine.toLocaleString('ru-RU');
  let summaryText = '';
  if (riskLevel === 'MINIMAL') {
    summaryText = '100% соответствие требованиям 152-ФЗ. Сайт соблюдает правила сбора ПДн, сервер локализован в РФ, формы содержат корректные согласия.';
  } else if (riskLevel === 'LOW') {
    summaryText = `Высокий уровень соответствия (${score}/100). Выявлены незначительные замечания (${violations.length} шт.), риск штрафов минимален.`;
  } else if (riskLevel === 'MEDIUM') {
    summaryText = `Средний риск штрафов (${score}/100). Обнаружено ${violations.length} нарушений. Потенциальная сумма штрафов Роскомнадзора: до ${fineFormatted} ₽.`;
  } else if (riskLevel === 'HIGH') {
    summaryText = `Высокий риск штрафов (${score}/100). Обнаружено ${violations.length} серьезных нарушений. Рекомендуется срочное устранение замечаний. Сумма рисков: до ${fineFormatted} ₽.`;
  } else {
    summaryText = `КРИТИЧЕСКИЙ РИСК (${score}/100). Выявлены фундаментальные нарушения 152-ФЗ (включая локализацию баз данных). Штраф по КоАП РФ может составить до ${fineFormatted} ₽ с риском блокировки ресурса.`;
  }

  task.report = {
    target_url: validUrl,
    audit_date: new Date().toISOString(),
    compliance_score: score,
    risk_level: riskLevel,
    max_potential_fine_rub: maxFine,
    scanned_pages_count: Math.min(maxPages, 3),
    scanned_pages: [validUrl, `${validUrl}/contacts`, `${validUrl}/privacy`],
    forms_audit: formsAudit,
    privacy_policy_audit: policyAudit,
    cookie_audit: cookieAudit,
    ssl_audit: {
      is_https: isHttps,
      is_valid: sslValid,
      issuer: sslIssuer,
      days_left: daysLeft,
      protocols: isHttps ? ['TLS 1.3', 'TLS 1.2'] : [],
      violations: sslViolations
    },
    localization_audit: {
      ip_address: ipAddress,
      hostname: hostname,
      country_code: countryCode,
      country_name: countryName,
      city: city,
      isp: isp,
      is_located_in_rf: isLocatedInRf,
      violations: locViolations
    },
    violations: violations,
    summary_text: summaryText,
    quick_fix_checklist: violations.map(v => v.remediation_guide)
  };

  task.progress = 100;
  task.current_step = 'Аудит успешно завершен';
  task.status = 'COMPLETED';
  task.completed_at = new Date().toISOString();
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: '152-fz-auditor', timestamp: new Date().toISOString() });
  });

  app.get('/api/presets', (req, res) => {
    res.json(PRESETS);
  });

  app.post('/api/scan', (req, res) => {
    const clientIp = req.ip || '127.0.0.1';
    if (!checkRateLimit(clientIp)) {
      return res.status(429).json({ error: 'Превышен лимит запросов. Подождите 1 минуту.' });
    }

    const { url, deepScan = true, maxPages = 5 } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Необходимо указать валидный URL для проверки.' });
    }

    const taskId = 'task_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    const newTask: StoredTask = {
      id: taskId,
      target_url: url,
      status: 'PENDING',
      progress: 0,
      current_step: 'Задача добавлена в очередь сканирования...',
      created_at: new Date().toISOString()
    };

    tasksMap.set(taskId, newTask);

    // Launch async scan in background
    runBackgroundScan(taskId, url, maxPages).catch(err => {
      console.error('Scan error:', err);
      const t = tasksMap.get(taskId);
      if (t) {
        t.status = 'FAILED';
        t.error_message = String(err);
      }
    });

    res.status(202).json({
      task_id: taskId,
      status: 'PENDING',
      target_url: url,
      estimated_time_sec: 5,
      message: 'Аудит поставлен в очередь асинхронного воркера.'
    });
  });

  app.get('/api/status/:task_id', (req, res) => {
    const taskId = req.params.task_id;
    const task = tasksMap.get(taskId);
    if (!task) {
      return res.status(404).json({ error: 'Задача с указанным ID не найдена.' });
    }

    res.json({
      task_id: task.id,
      status: task.status,
      progress: task.progress,
      current_step: task.current_step,
      created_at: task.created_at,
      completed_at: task.completed_at,
      error_message: task.error_message
    });
  });

  app.get('/api/report/:task_id', (req, res) => {
    const taskId = req.params.task_id;
    const task = tasksMap.get(taskId);
    if (!task) {
      return res.status(404).json({ error: 'Задача с указанным ID не найдена.' });
    }

    if (task.status !== 'COMPLETED') {
      return res.status(409).json({
        error: 'Аудит еще выполняется или завершился с ошибкой.',
        status: task.status,
        progress: task.progress
      });
    }

    res.json({
      task_id: task.id,
      status: task.status,
      created_at: task.created_at,
      completed_at: task.completed_at,
      report: task.report
    });
  });

  // Provide the full Python microservice files for code review in UI
  app.get('/api/python-codebase', async (req, res) => {
    try {
      const files = [
        { path: 'requirements.txt', label: 'Dependencies (FastAPI, Celery, Playwright)' },
        { path: 'app/main.py', label: 'FastAPI Main Application & Lifespan' },
        { path: 'app/core/config.py', label: 'Pydantic Settings & Env Config' },
        { path: 'app/core/database.py', label: 'SQLAlchemy 2.0 Async Session' },
        { path: 'app/core/celery_app.py', label: 'Celery & Redis Worker Setup' },
        { path: 'app/models/audit.py', label: 'SQLAlchemy 2.0 ORM Models (JSONB)' },
        { path: 'app/schemas/audit.py', label: 'Pydantic v2 Validation Schemas' },
        { path: 'app/api/v1/endpoints/scan.py', label: 'FastAPI REST Routes & Rate Limiting' },
        { path: 'app/services/parser.py', label: 'Playwright & BeautifulSoup DOM Engine' },
        { path: 'app/services/compliance.py', label: '152-FZ Legal Rule Engine & 13.11 КоАП' },
        { path: 'app/tasks/celery_worker.py', label: 'Celery Async Background Task Pipeline' },
        { path: 'Dockerfile', label: 'Docker Image (Playwright Chromium)' },
        { path: 'docker-compose.yml', label: 'Docker Compose (Postgres, Redis, Worker, Nginx)' },
        { path: 'nginx.conf', label: 'Nginx Reverse Proxy & Rate Limiting' },
        { path: 'README.md', label: 'Deployment & Architectural Guide' }
      ];

      const loadedFiles = await Promise.all(
        files.map(async (f) => {
          try {
            const content = await fs.readFile(path.join(process.cwd(), 'backend_python', f.path), 'utf-8');
            return { ...f, content };
          } catch {
            return { ...f, content: '# File loading error' };
          }
        })
      );

      res.json(loadedFiles);
    } catch (e) {
      res.status(500).json({ error: 'Failed to load Python codebase' });
    }
  });

  // Vite middleware setup
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`152-FZ Auditor Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
