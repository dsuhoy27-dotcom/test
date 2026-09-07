# 🛡️ Аудитор 152-ФЗ на Streamlit (Compliance Scanner)

Микросервис автоматической проверки сайтов на соответствие 152-ФЗ с возможностью встраивания в `<iframe>` на сторонний сайт.

## 🚀 Возможности
- **Проверка локализации (ч. 5 ст. 18 152-ФЗ)**: Определение GeoIP сервера и валидация нахождения ЦОД в РФ.
- **SSL / Защита соединения (ст. 19 152-ФЗ)**: Проверка шифрования передачи ПДн.
- **Инспекция веб-форм**: Поиск полей персональных данных, проверка наличия и ненажатого статуса чекбокса согласия (ст. 9 152-ФЗ).
- **Проверка битых ссылок согласий (HTTP 200 vs 404)**: Валидация фактического кода ответа страницы Политики конфиденциальности.
- **Cookie-баннеры и трекеры**: Детект счетчиков (Яндекс.Метрика, GA4, VK Pixel) и проверка наличия баннера с явной кнопкой согласия («Принять»).
- **Калькулятор штрафов КоАП РФ**: Расчет совокупного риска по ст. 13.11 КоАП РФ.

---

## 📦 Быстрый деплой на Streamlit Community Cloud

1. Загрузите файлы в ваш репозиторий на GitHub:
   - `app.py`
   - `requirements.txt`
   - `packages.txt`
   - `.streamlit/config.toml`
2. Перейдите на [share.streamlit.io](https://share.streamlit.io) и нажмите **New app**.
3. Выберите ваш репозиторий, ветку `main` и файл `app.py`.
4. Нажмите **Deploy!**

---

## 🌐 Встраивание на страницу вашего сайта (iFrame)

Файл `.streamlit/config.toml` уже настроен для работы внутри iframe:
```toml
[server]
enableCORS = false
enableXsrfProtection = false
```

Вставьте следующий HTML-код в блок Tilda, WordPress, Bitrix или в разметку вашего сайта:

```html
<div style="width: 100%; max-width: 1200px; margin: 0 auto;">
  <iframe 
    src="https://your-app-name.streamlit.app/?embed=true" 
    width="100%" 
    height="850px" 
    frameborder="0"
    style="border: 1px solid #E2E8F0; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);"
    allow="clipboard-write">
  </iframe>
</div>
```

*(Замените `https://your-app-name.streamlit.app` на адрес вашего опубликованного приложения).*
