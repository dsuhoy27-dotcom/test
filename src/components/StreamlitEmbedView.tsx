import React, { useState } from 'react';
import { Layers, Copy, Check, ExternalLink, Terminal, Shield, Code, Sparkles } from 'lucide-react';

export const StreamlitEmbedView: React.FC = () => {
  const [copied, setCopied] = useState(false);
  const [copiedApp, setCopiedApp] = useState(false);
  const [appUrl, setAppUrl] = useState('https://your-152fz-scanner.streamlit.app');
  const [iframeHeight, setIframeHeight] = useState('850');
  const [maxWidth, setMaxWidth] = useState('1200');

  const embedCode = `<div style="width: 100%; max-width: ${maxWidth}px; margin: 0 auto;">
  <iframe
    src="${appUrl}/?embed=true"
    width="100%"
    height="${iframeHeight}px"
    frameborder="0"
    style="border: 1px solid #E2E8F0; border-radius: 12px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.07); display: block;"
    allow="clipboard-write">
  </iframe>
</div>`;

  const handleCopy = () => {
    navigator.clipboard.writeText(embedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto animate-fade-in">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-10 -translate-y-10 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-xs font-semibold text-blue-200">
            <Layers className="w-3.5 h-3.5" />
            <span>Streamlit Community Cloud + iFrame Embed</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Развертывание на Streamlit и встраивание на ваш сайт
          </h2>
          <p className="text-slate-300 text-sm max-w-2xl leading-relaxed">
            Полнофункциональный UI на Streamlit (<code className="bg-black/30 px-1.5 py-0.5 rounded text-sky-300">st.tabs</code>, <code className="bg-black/30 px-1.5 py-0.5 rounded text-sky-300">st.text_input</code>, <code className="bg-black/30 px-1.5 py-0.5 rounded text-sky-300">st.button</code>), однопоточный Playwright с оптимизацией потребления памяти (&lt;1 ГБ) и готовый код встраивания через <code className="bg-black/30 px-1.5 py-0.5 rounded text-sky-300">&lt;iframe&gt;</code>.
          </p>
        </div>
      </div>

      {/* Grid: 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: iFrame Configurator */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white rounded-2xl border border-[#E2E8F0] p-6 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
                <Code className="w-5 h-5 text-blue-600" />
                <span>Генератор iFrame кода для вставки</span>
              </h3>
              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono">
                HTML5 embed
              </span>
            </div>

            <div className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  URL вашего Streamlit приложения:
                </label>
                <input
                  type="text"
                  value={appUrl}
                  onChange={(e) => setAppUrl(e.target.value)}
                  placeholder="https://your-app.streamlit.app"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Параметр <code className="text-blue-600 font-bold">?embed=true</code> автоматически скроет меню и футер Streamlit.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Высота блока (px):
                  </label>
                  <input
                    type="number"
                    value={iframeHeight}
                    onChange={(e) => setIframeHeight(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Макс. ширина (px):
                  </label>
                  <input
                    type="number"
                    value={maxWidth}
                    onChange={(e) => setMaxWidth(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Generated Code */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  HTML-код для вставки (Tilda / WP / HTML)
                </span>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-all"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Скопировано!' : 'Скопировать код'}</span>
                </button>
              </div>
              <pre className="p-4 bg-slate-900 text-slate-100 rounded-xl text-xs font-mono overflow-x-auto leading-relaxed border border-slate-800">
                {embedCode}
              </pre>
            </div>
          </div>

          {/* Quick CMS Embed Instructions */}
          <div className="bg-white rounded-2xl border border-[#E2E8F0] p-6 shadow-sm space-y-4">
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>Куда вставлять код:</span>
            </h4>
            <ul className="text-xs text-slate-600 space-y-2 leading-relaxed">
              <li className="flex items-start gap-2">
                <span className="font-bold text-blue-600 min-w-[60px]">Tilda:</span>
                <span>Добавьте блок <strong>T123 (HTML-код)</strong> в ZeroBlock или стандартный блок и вставьте код внутрь.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold text-blue-600 min-w-[60px]">WordPress:</span>
                <span>В редакторе Gutenberg добавьте блок <strong>Пользовательский HTML (Custom HTML)</strong>.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold text-blue-600 min-w-[60px]">Битрикс:</span>
                <span>Вставьте в визуальном редакторе в режиме «Редактировать как HTML».</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Right: Deployment Steps */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-2xl border border-[#E2E8F0] p-6 shadow-sm space-y-4">
            <h3 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
              <Terminal className="w-5 h-5 text-indigo-600" />
              <span>Чеклист деплоя на Streamlit Cloud</span>
            </h3>

            <div className="space-y-4 text-xs text-slate-600 leading-relaxed">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px]">1</span>
                  <span>Файлы проекта в репозитории</span>
                </div>
                <p className="pl-6 text-slate-600">
                  Все файлы уже созданы в корне проекта: <code className="text-indigo-600">app.py</code>, <code className="text-indigo-600">requirements.txt</code>, <code className="text-indigo-600">packages.txt</code> и <code className="text-indigo-600">.streamlit/config.toml</code>.
                </p>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px]">2</span>
                  <span>Разрешение iFrame в config.toml</span>
                </div>
                <p className="pl-6 text-slate-600">
                  В файле <code className="text-indigo-600">.streamlit/config.toml</code> отключены XSRF и CORS, чтобы окно открывалось внутри чужих сайтов без блокировки браузером.
                </p>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px]">3</span>
                  <span>1 клик на share.streamlit.io</span>
                </div>
                <p className="pl-6 text-slate-600">
                  Авторизуйтесь на Streamlit Community Cloud через GitHub, выберите репозиторий и укажите Main file path: <code className="text-indigo-600">app.py</code>.
                </p>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px]">4</span>
                  <span>Лимит памяти Playwright</span>
                </div>
                <p className="pl-6 text-slate-600">
                  В коде <code className="text-indigo-600">app.py</code> заложен однопоточный режим с флагами <code className="text-indigo-600">--single-process --disable-dev-shm-usage</code> и автоматический фоллбэк на HTTPX при пиковых нагрузках, предотвращающий падение сервиса.
                </p>
              </div>
            </div>

            <div className="pt-2">
              <a
                href="https://share.streamlit.io"
                target="_blank"
                rel="noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition-all shadow-sm"
              >
                <span>Открыть Streamlit Community Cloud</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
